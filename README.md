# Chess Learning App (Hebrew)
# אפליקציית לימוד שחמט

A interactive web application for recording, saving, and practicing chess move sequences. Built with HTML, CSS, JavaScript (Vanilla), and Firebase Realtime Database.

## Features
- **Interactive Board**: Play and record moves.
- **Save/Load**: Save sequences to the cloud (Firebase) and access them from anywhere.
- **Practice Mode**: Drill your saved sequences with immediate feedback.
- **Auto-Play**: Watch sequences play out automatically.
- **Hebrew Interface**: Fully localized right-to-left UI.

## How to Run
### Online (GitHub Pages)
1. Upload all files (`index.html`, `style.css`, `app.js`, `chess.js`) to a GitHub repository.
2. Enable **GitHub Pages** in the repository settings.
3. The site will be live and fully functional.

### Locally
Due to the use of ES Modules (for Firebase), you cannot simply double-click `index.html` in some browsers (like Chrome) due to security restrictions.
You must run a local server. For example:
- VS Code: Use "Live Server" extension.
- Python: `python -m http.server`
- Node: `npx serve`

## Technologies
- **Chess Logic**: `chess.js`
- **Database**: Firebase Realtime Database
- **UI**: CSS Grid/Flexbox
