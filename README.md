# Stockroom

A phone-first inventory app that works like an Amazon warehouse, scaled down for a small business.

- **Bins:** every shelf spot gets an address like `A01-R02-S3` (aisle, rack, shelf) and a QR label.
- **Stow:** scan the item, scan the bin, enter how many. Stock can go anywhere with room, and the app remembers where.
- **Pick:** add what an order needs. The app splits it across bins and sorts the stops into one walk through the aisles. Scanning the bin and the item at each stop catches wrong picks.
- **Find:** search or scan anything to see which aisle, rack and shelf it's on.
- **Labels:** print QR labels for bins and barcode labels for items, three across on sticker paper.
- **Live camera scanning** for product barcodes (UPC, EAN, Code 128 and more) and QR codes. Bluetooth and USB handheld scanners work too.
- **Installs to the home screen** and keeps working with a weak signal.

It's plain HTML and JavaScript. No build step and no server to run.

---

## Step 1: Put it on GitHub Pages (about 5 minutes, free)

The camera only works on a secure (`https://`) website. GitHub Pages gives you one for free.

1. Make a free account at [github.com](https://github.com) if you don't have one.
2. Click **+** (top right) → **New repository**. Name it `stockroom`, set it to **Public**, and click **Create repository**.
3. On the new repo page, click **uploading an existing file**. Drag in **everything inside this folder**, including the `icons` folder. Click **Commit changes**.
4. Go to **Settings → Pages**. Under **Branch**, choose `main` and `/ (root)`, then click **Save**.
5. Wait a minute or two, then refresh. The page shows your app's address, something like `https://yourname.github.io/stockroom/`.

> GitHub Pages sites on a free account are public. Anyone with the link can open the app, but in Step 3 the **inventory data** is locked to the Google accounts you approve. Until you do Step 3, each phone only sees its own data.

## Step 2: Install it on the phone

Open the address on the phone, then:

- **iPhone (Safari):** tap Share → **Add to Home Screen**.
- **Android (Chrome):** tap ⋮ → **Install app** (or **Add to Home screen**).

The first time you tap **Scan**, allow camera access.

## Step 3: Share inventory between phones (recommended)

Without this, inventory is saved on each phone separately. With it, every phone and computer sees the same stock, live. Firebase's free plan is plenty for a small business.

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Create a project**. Name it `stockroom`. You can turn off Google Analytics.
2. **Build → Firestore Database → Create database.** Pick the location closest to you and start in **production mode**.
3. **Build → Authentication → Get started → Google → Enable → Save.**
4. **Authentication → Settings → Authorized domains → Add domain** and enter `yourname.github.io`.
5. **Project settings** (gear icon) → **Your apps** → click the **`</>`** web icon. Name it `stockroom` and click **Register app**. Copy the `firebaseConfig = { ... }` values.
6. Open `config.js` in your GitHub repo (click the file, then the pencil icon). Replace `window.STOCKROOM_FIREBASE = null;` with your values:

   ```js
   window.STOCKROOM_FIREBASE = {
     apiKey: "AIza...",
     authDomain: "stockroom-xxxx.firebaseapp.com",
     projectId: "stockroom-xxxx",
     storageBucket: "stockroom-xxxx.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

   Commit the change. The `apiKey` is safe to publish; the security rules in the next step are what protect the data.
7. **Firestore Database → Rules.** Paste in the contents of `firestore.rules`, put in the real Gmail addresses of everyone allowed in, and click **Publish**.

Open the app again. It asks everyone to sign in with Google, and only the listed accounts can see or change inventory. To add an employee later, add their address in the Rules tab and publish again.

## Using it

1. **Bins tab:** create your bins, for example aisle `A01`, racks 1 to 4, 4 shelves each. That makes 16 bins.
2. **Labels tab → Bin labels → Print.** Stick a label on each shelf spot.
3. **Stow tab:** tap **Scan**, scan a product, then scan a bin label, enter the count, and tap **Stow**. Unknown barcodes open a short form to add the product. For things you make yourself, tap **Item has no barcode? Create one**, then print an item label for it.
4. **Find tab:** scan or search anything to see where it is.
5. **Pick tab:** build the order, tap **Start picking**, and follow the route.

**Three ways to scan:**
- The **Scan** button opens the live camera in the app.
- The phone's **regular camera app** opens bin and item QR labels straight to that page.
- A **Bluetooth or USB handheld scanner** types into any scan box. Pair it as a keyboard; most scanners work this way out of the box.

## Updating the app

Edit files in GitHub and commit. If phones keep showing the old version, open `sw.js`, change `stockroom-v1` to `stockroom-v2` (and so on), and commit. Phones update the next time the app opens.

## Files

| File | What it is |
|---|---|
| `index.html` | Page layout and styles |
| `app.js` | All app logic: scanning, stow, pick, bins, labels |
| `config.js` | Firebase settings (optional) |
| `firestore.rules` | Who can access shared inventory |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | Home screen install |
