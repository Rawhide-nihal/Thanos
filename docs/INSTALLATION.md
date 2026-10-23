# SnapShift Installation & Setup Guide

## Prerequisites
- Node.js 18+ (tested with Node.js v24.21.0)
- npm 9+
- Google Chrome (Windows 10/11 recommended)
- A working webcam and microphone

---

## 1. Quick Start (Development & Web Studio)

1. Clone or open the repository root:
   ```bash
   git clone https://github.com/Rawhide-nihal/Thanos.git
   cd Thanos
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch the development server:
   ```bash
   npm run dev
   ```
   This opens **SnapShift Studio Pro** at `http://localhost:3000/studio.html`.

---

## 2. Building the Chrome Extension

To create the production Manifest V3 Chrome extension:

1. Run the build command:
   ```bash
   npm run build
   ```
   This will compile the TypeScript bundles and output the ready-to-load extension into the `dist/` directory.

2. Verify that `dist/` contains:
   - `manifest.json`
   - `popup.html`, `studio.html`, `output.html`
   - `background.js`, `content.js`, `interceptor.js`
   - `models/` (locally bundled MediaPipe models)
   - `wasm/` (locally bundled MediaPipe WebAssembly binaries)
   - `icons/`

---

## 3. Loading the Extension into Google Chrome

1. Open Google Chrome.
2. Navigate to:
   ```
   chrome://extensions
   ```
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** in the top-left toolbar.
5. In the file picker, select the `dist/` folder inside your project directory:
   `c:\Users\metuk\Videos\WEB aDDON\dist`
6. SnapShift will appear in your Chrome toolbar. Pin the extension for quick access.

---

## 4. Granting Camera & Microphone Permissions

1. Click the SnapShift icon in the Chrome toolbar or open `chrome-extension://<id>/studio.html`.
2. When prompted by Chrome, click **Allow** for Camera and Microphone access.
3. If permissions were previously blocked:
   - Click the site settings lock icon next to the address bar.
   - Set **Camera** and **Microphone** to **Allow**.
   - Refresh the page.
