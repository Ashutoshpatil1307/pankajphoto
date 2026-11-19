import express from 'express'
import cors from 'cors'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { v2 as cloudinary } from 'cloudinary'
import { applicationDefault, cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const projectRoot=dirname(fileURLToPath(import.meta.url))
dotenv.config({path:resolve(projectRoot,'.env')})
const app=express()
app.use(cors({origin:true,credentials:true}))
app.use(express.json({limit:'2mb'}))

const cloudName=process.env.CLOUDINARY_CLOUD_NAME||'voc7fyl2'
const uploadPreset=process.env.CLOUDINARY_UPLOAD_PRESET||'pankaj bhoi'
const apiKey=process.env.CLOUDINARY_API_KEY
const apiSecret=process.env.CLOUDINARY_API_SECRET
const projectId='pankaj-photography'
let adminCredentialSetupError=process.env.FIREBASE_PROJECT_ID&&process.env.FIREBASE_PROJECT_ID!==projectId
  ?`FIREBASE_PROJECT_ID must be ${projectId}.`
  :''
let adminCredentialConfigured=false

cloudinary.config({cloud_name:cloudName,api_key:apiKey,api_secret:apiSecret})

if(!getApps().length){
  let credential=applicationDefault()
  const credentialsPath=process.env.GOOGLE_APPLICATION_CREDENTIALS
  if(!adminCredentialSetupError&&process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
    try{
      const serviceAccount=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      if(serviceAccount.project_id!==projectId){
        adminCredentialSetupError=`Firebase service-account project_id must match ${projectId}.`
        console.error(adminCredentialSetupError)
      }else{
        credential=cert(serviceAccount)
        adminCredentialConfigured=true
      }
    }catch{
      adminCredentialSetupError='FIREBASE_SERVICE_ACCOUNT_JSON is not valid service-account JSON.'
      console.error(adminCredentialSetupError)
    }
  }else if(!adminCredentialSetupError&&credentialsPath){
    const absolutePath=resolve(projectRoot,credentialsPath)
    if(!existsSync(absolutePath)){
      adminCredentialSetupError=`Firebase service-account file not found at ${absolutePath}.`
      console.error(adminCredentialSetupError)
    }else try{
      const serviceAccount=JSON.parse(readFileSync(absolutePath,'utf8'))
      if(serviceAccount.project_id!==projectId){
        adminCredentialSetupError=`Firebase service-account project_id must match ${projectId}.`
        console.error(adminCredentialSetupError)
      }else{
        credential=cert(serviceAccount)
        adminCredentialConfigured=true
      }
    }catch{
      adminCredentialSetupError=`Firebase service-account file at ${absolutePath} is not valid service-account JSON.`
      console.error(adminCredentialSetupError)
    }
  }else if(!adminCredentialSetupError&&process.env.FIREBASE_ADMIN_USE_ADC==='true'){
    adminCredentialConfigured=true
  }
  initializeApp({credential,projectId})
}

async function requireAdmin(req,res,next){
  const authorization=req.headers.authorization||''
  const token=authorization.startsWith('Bearer ')&&authorization.slice(7)
  if(!token)return res.status(401).json({error:'Authentication required. Sign in with Firebase and retry.'})

  let decoded
  try{
    decoded=await getAuth().verifyIdToken(token)
  }catch(error){
    console.warn('Firebase ID token verification failed:',error?.code||'unknown error')
    return res.status(401).json({error:'Firebase ID token is invalid or expired. Sign in again.',code:error?.code||'auth/invalid-id-token'})
  }

  if(adminCredentialSetupError){
    return res.status(503).json({
      error:'Firebase Admin credentials are unavailable or do not match pankaj-photography. Check the server configuration and API logs.',
      code:'admin/credentials-not-configured',
    })
  }
  if(!adminCredentialConfigured){
    return res.status(503).json({
      error:'Firebase Admin credentials are not configured. Set GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT_JSON, or enable Application Default Credentials on the server.',
      code:'admin/credentials-not-configured',
    })
  }

  try{
    const user=await getFirestore().collection('users').doc(decoded.uid).get()
    if(!user.exists||user.data()?.role!=='admin'){
      return res.status(403).json({error:'Administrator access required. Add users/{Firebase UID} with role: "admin".'})
    }
    req.adminUid=decoded.uid
    return next()
  }catch(error){
    console.error('Firebase admin role lookup failed:',error?.code||'unknown error')
    const message=String(error?.message||'')
    const missingCredentials=
      error?.code==='app/invalid-credential'||
      /default credentials|credential implementation provided|ENOENT|private key/i.test(message)
    return res.status(missingCredentials?503:500).json({
      error:missingCredentials
        ?'Firebase Admin credentials are unavailable on the server. Configure GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON and restart the API.'
        :'Could not verify the administrator role in Firestore. Check the server service-account permissions and Firestore availability.',
      code:error?.code||'admin/role-check-failed',
    })
  }
}

app.post('/api/cloudinary/sign',requireAdmin,(req,res)=>{
  if(!apiKey||!apiSecret)return res.status(503).json({error:'Cloudinary API Key and API Secret are not configured on the server.'})
  const resourceType=req.body?.resourceType
  if(!['image','video'].includes(resourceType))return res.status(400).json({error:'resourceType must be image or video.'})
  const allowedFolders=new Set([
    'pankaj-bhoi-photography/portfolio',
    'pankaj-bhoi-photography/videos',
    'pankaj-bhoi-photography/branding',
    'pankaj-bhoi-photography/backgrounds',
  ])
  const folder=typeof req.body?.folder==='string'&&allowedFolders.has(req.body.folder)
    ?req.body.folder
    :resourceType==='video'?'pankaj-bhoi-photography/videos':'pankaj-bhoi-photography/portfolio'
  const timestamp=Math.round(Date.now()/1000)
  const params={timestamp,upload_preset:uploadPreset,folder}
  try{
    const signature=cloudinary.utils.api_sign_request(params,apiSecret)
    res.json({cloudName,uploadPreset,apiKey,timestamp,signature,folder})
  }catch(error){
    console.error('Cloudinary signature generation failed:',error?.message||'unknown error')
    res.status(500).json({error:'Could not create a Cloudinary upload signature.',code:'cloudinary/signature-failed'})
  }
})

app.post('/api/cloudinary/delete',requireAdmin,async(req,res)=>{
  if(!apiSecret)return res.status(503).json({error:'Cloudinary API Secret is not configured on the server.'})
  const {publicId,resourceType='image'}=req.body||{}
  if(typeof publicId!=='string'||!publicId.startsWith('pankaj-bhoi-photography/'))return res.status(400).json({error:'A Cloudinary publicId in the photography media folders is required.'})
  if(!['image','video'].includes(resourceType))return res.status(400).json({error:'resourceType must be image or video.'})
  try{
    const result=await cloudinary.uploader.destroy(publicId,{resource_type:resourceType,invalidate:true})
    if(result.result!=='ok'&&result.result!=='not found')return res.status(502).json({error:'Cloudinary did not confirm asset deletion.'})
    res.json(result)
  }catch(error){
    console.error('Cloudinary delete failed:',error?.message||'unknown error')
    res.status(502).json({error:'Cloudinary delete failed. Check Cloudinary credentials and retry.'})
  }
})

app.get('/api/health',(_req,res)=>res.json({
  ok:true,
  cloudName,
  cloudinaryConfigured:Boolean(apiKey&&apiSecret),
  firebaseAdminConfigured:Boolean(adminCredentialConfigured&&!adminCredentialSetupError),
}))

app.use((req,res)=>res.status(404).json({error:'API endpoint not found.',code:'api/not-found'}))
app.use((error,req,res,next)=>{
  if(res.headersSent)return next(error)
  const status=Number(error?.status||error?.statusCode)||500
  const badJson=error?.type==='entity.parse.failed'
  const tooLarge=error?.type==='entity.too.large'
  const code=badJson?'request/invalid-json':tooLarge?'request/body-too-large':'api/request-failed'
  const message=badJson
    ?'Request body must contain valid JSON.'
    :tooLarge
      ?'Request body is too large.'
      :'The API could not process this request.'
  if(status>=500)console.error('API request failed:',error?.message||'unknown error')
  res.status(status>=400&&status<600?status:500).json({error:message,code})
})

const port=Number(process.env.API_PORT||8787)
app.listen(port,()=>console.log(`Cloudinary API listening on http://127.0.0.1:${port}`))
