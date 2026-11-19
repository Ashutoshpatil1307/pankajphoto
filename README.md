# Pankaj Bhoi Photography

React photography website using Firebase Authentication/Firestore and Cloudinary for photos and videos.

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

## Required frontend Firebase variables

Add these to `.env` from Firebase Project Settings:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Firebase Storage is not used.

## Required Cloudinary variables

The Cloud name and signed preset are already configured:

- `CLOUDINARY_CLOUD_NAME=voc7fyl2`
- `CLOUDINARY_UPLOAD_PRESET=pankaj bhoi`

Add these server-only values:

- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Get the API Key and API Secret from Cloudinary Console > Settings > Access Keys. Never put the API Secret in `.env` variables beginning with `VITE_` or in frontend files.

## Signed upload backend authorization

For local development, download a service-account JSON from **Firebase Console > Project settings > Service accounts > Generate new private key**. Store it here:

```text
<project-root>/secrets/firebase-service-account.json
```

The `secrets/` folder and common service-account JSON filenames are excluded in `.gitignore`. Never put this file in `public/`, `src/`, or any `VITE_*` setting.

Set this server-only variable in the project-root `.env`:

```text
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-service-account.json
FIREBASE_PROJECT_ID=pankaj-photography
```

The backend resolves a relative path from the project root and loads the JSON with Firebase Admin SDK. Alternatively, set `GOOGLE_APPLICATION_CREDENTIALS` to an absolute path. Do not paste the JSON private key into chat or frontend code.

The `/api/cloudinary/sign` and `/api/cloudinary/delete` endpoints verify the Firebase ID token and require the matching `users/{uid}` Firestore document to have the string field `role: "admin"`. The server also verifies that the service-account `project_id` is `pankaj-photography`.

## Grant dashboard administrator access

The website's dashboard uses the Firestore user document authorization method:

1. In Firebase Console, open **Authentication > Users** and locate `pankajbhoi058@gmail.com`.
2. Confirm that user's UID is `8DMvmGA1KTc1kDmMXRmUJwYm1xE3`.
3. Open **Firestore Database > Data** and create the `users` collection if it does not exist.
4. Create a document whose document ID is the exact copied UID (not the email).
5. Add field `role`, type **string**, value `admin`.
6. Sign out/in on the website and visit `/admin/dashboard`.

The rules in `firestore.rules` allow a signed-in user to read their own UID document; only users with the admin role document can modify protected website content. Custom claims do not grant access. Deploy the updated rules with `firebase deploy --only firestore:rules --project pankaj-photography`.

## Manage website content

After signing in at `/admin/dashboard`:

- **Website Settings** edits the brand, contact details, social links, footer copyright, homepage copy, accent color, and Instagram QR visibility. These values are saved to the existing `website_settings/published` document and update on connected devices through Firestore listeners.
- **Website Logo** accepts JPG, PNG, or WEBP files up to 10 MB. It uploads through the authenticated Cloudinary signing API to the `pankaj-bhoi-photography/branding` folder, then saves the Cloudinary URL in `website_settings/published`. The current logo remains in place unless both the upload and Firestore save succeed.
- **Page Background Management** uploads a homepage hero photo or video through the authenticated Cloudinary signing API to the `pankaj-bhoi-photography/backgrounds` folder. It can also activate media from the existing portfolio and video library. The active URL and retained uploaded-background list are stored with the existing website settings; removing the active background restores the original slideshow without deleting its Cloudinary asset.
- **Website Editor** edits the homepage hero and section text. **Packages**, **Reviews**, **Videos**, **Portfolio**, and **Inquiries** use their existing Firestore collections. Photo categories remain editable in each photo's editor.
- The Instagram link and QR use the profile URL saved in Website Settings. The initial profile URL is the Pankaj Bhoi Photography Instagram profile.

## Test media uploads locally

1. Fill in the Firebase web settings, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the ignored project-root `.env`. Keep the Cloudinary secret out of all `VITE_*` variables.
2. Save the downloaded Firebase service-account file at `secrets/firebase-service-account.json`. Its `project_id` must be `pankaj-photography`. Alternatively, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the service-account JSON in the backend environment; when both are set, that variable takes precedence.
3. In Firestore, create `users/8DMvmGA1KTc1kDmMXRmUJwYm1xE3` with string field `role` set to `admin`.
4. In the VS Code terminal at the project root, run `npm run dev`.
5. Open `http://127.0.0.1:5173/admin/login`, sign in with the authorized account, then use **Portfolio** to choose, preview, edit metadata, and publish an image, or **Videos** to do the same for a video.

The API health check is `http://127.0.0.1:8787/api/health`. Its response reports whether Firebase Admin and Cloudinary credentials are configured without returning any secrets.

## Commands

- `npm run dev` - Vite website and secure Cloudinary API together
- `npm run dev:web` - Vite only
- `npm run dev:api` - Cloudinary API only
- `npm run build` - production build
- `npm run preview` - preview production build

## Deployment

Firebase Hosting serves the static React build; it does not run `server.js`. Deploy `server.js` separately to a Node hosting service (or configure a Firebase Hosting rewrite to a deployed Cloud Run/Functions service) and proxy `/api/*` to it. Set `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`, and `FIREBASE_PROJECT_ID` as server-only environment variables.

On Cloud Run or another Google Cloud host, prefer the host's attached service identity / Application Default Credentials and grant it only the Firestore read access needed to check `users/{uid}`. Do not upload the local service-account JSON with the frontend build. If the host does not provide ADC, mount the service-account JSON as a protected secret file outside the public web root and set `GOOGLE_APPLICATION_CREDENTIALS` to that file path in the Node service configuration. Configure `/api/*` to proxy to the Node API on the same public domain.
