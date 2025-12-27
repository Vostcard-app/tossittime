# TossItTime - Food Expiration Tracker

A Progressive Web App (PWA) that helps you remember to use food before it expires. Track your food items, scan barcodes, and receive reminders before it's toss it time!

## Features

- 📱 **Progressive Web App** - Install on your device for offline access
- 📷 **Barcode Scanning** - Scan barcodes to quickly add items
- 📅 **Expiration Tracking** - Track expiration dates with visual status indicators
- 🔔 **Smart Reminders** - Get notifications for items expiring soon
- 📸 **Photo Support** - Add photos to your food items
- 🎨 **Modern UI** - Clean, mobile-first design

## Tech Stack

- **React** + **TypeScript** - Modern frontend framework
- **Vite** - Fast build tool and dev server
- **Firebase** - Authentication, Firestore database, and Storage
- **PWA** - Service worker and offline support via vite-plugin-pwa
- **QR Scanner** - Barcode scanning functionality
- **Netlify** - Hosting and deployment

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase project with Firestore and Storage enabled

### Installation

1. Clone the repository:
```bash
cd tossittime-web
npm install
```

2. Set up Firebase:
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication (Email/Password)
   - Create a Firestore database
   - Enable Storage
   - Copy your Firebase config

3. Create a `.env` file in the root directory:
```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_site_key_here
```

4. Set up Google reCAPTCHA v3 (for registration protection):
   - Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
   - Click "Create" to create a new site
   - Select reCAPTCHA v3
   - Add your domain (e.g., `localhost` for development, your production domain for production)
   - Copy the Site Key and add it to your `.env` file as `VITE_RECAPTCHA_SITE_KEY`
   - Note: The Secret Key is for backend verification (optional for basic protection)

5. Set up Firestore Security Rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Food items - users can only access their own
    match /foodItems/{itemId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    
    // User settings - users can only access their own
    match /userSettings/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

6. Set up Storage Security Rules:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /foodItems/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

7. Run the development server:
```bash
npm run dev
```

8. Build for production:
```bash
npm run build
```

## Deployment

### Netlify

1. Connect your repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variables in Netlify dashboard
5. Deploy!

### Firebase Hosting (Alternative)

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init hosting`
4. Build: `npm run build`
5. Deploy: `firebase deploy`

## PWA Icons

You'll need to create app icons and place them in `public/icons/`:
- `icon-192.png` (192x192)
- `icon-512.png` (512x512)
- `icon-192-maskable.png` (192x192, maskable)
- `icon-512-maskable.png` (512x512, maskable)

## Project Structure

```
tossittime-web/
├── src/
│   ├── components/      # Reusable React components
│   ├── pages/          # Page components
│   ├── services/       # Firebase and API services
│   ├── hooks/          # Custom React hooks
│   ├── utils/          # Utility functions
│   ├── types/          # TypeScript type definitions
│   ├── firebase/       # Firebase configuration
│   ├── App.tsx         # Main app component
│   └── main.tsx        # Entry point
├── public/             # Static assets
├── netlify.toml        # Netlify configuration
└── vite.config.ts      # Vite configuration
```

## Features in Detail

### Food Item Management
- Add items manually or via barcode scan
- Track expiration dates
- Add photos, quantities, categories, and notes
- Automatic status calculation (fresh, expiring soon, expired)

### Notifications
- Browser notification support
- Configurable reminder days
- Daily expiration checks
- Smart notification scheduling

### Barcode Scanning
- Camera-based barcode scanning
- Support for common barcode formats
- Manual entry fallback

## License

MIT
