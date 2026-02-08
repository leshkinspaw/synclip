# ShareBridge

Sync clipboard between devices with P2P encryption.

## Modules

- `server`: Node.js signaling/relay server.
- `ui`: React-based browser extension (Brave/Chrome).

## How to use

### 1. Start the server
```bash
cd server
npm install
npm start
```
By default, the server runs on `http://localhost:3000`.

### 2. Build the extension
```bash
cd ui
npm install
npm run build
```
The build output will be in `ui/dist`.

### 3. Load the extension
1. Open Brave and go to `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `ui/dist` directory.

### 4. Configuration
1. Click the ShareBridge extension icon.
2. Go to **Settings** and ensure the Server IP is correct (e.g., `localhost:3000`).
3. Go to **Devices** and either generate a new seed phrase or enter an existing one.
4. Click **Save & Sync**.
5. Do the same on another computer with the **same seed phrase**.

## Security
Data is encrypted using AES-256 (via CryptoJS) with a key derived from your 12-word seed phrase. The server only sees encrypted blobs and does not have access to your seed phrase or clipboard content.
