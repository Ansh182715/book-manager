const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { PDFParse } = require('pdf-parse');

const DATA_FILE = path.join(app.getPath('userData'), 'books.json');

function loadBooksData() {
    if (!fs.existsSync(DATA_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveBooksData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

// Handle adding books and auto-detecting PDF page counts
ipcMain.handle('add-book', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Documents', extensions: ['pdf', 'epub'] }]
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    let totalPages = 'Unknown';

    if (path.extname(filePath).toLowerCase() === '.pdf') {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const uint8ArrayData = new Uint8Array(dataBuffer);
            const parser = new PDFParse(uint8ArrayData);
            const info = await parser.getInfo({ parsePageInfo: true });
            
            // Handle if info.pages is an array or an object/number
            if (Array.isArray(info?.pages)) {
                totalPages = info.pages.length;
            } else if (typeof info?.pages === 'number') {
                totalPages = info.pages;
            } else if (info?.numpages) {
                totalPages = info.numpages;
            } else {
                totalPages = 'Unknown';
            }
        } catch (err) {
            console.error("Could not parse PDF pages:", err);
        }
    }

    const books = loadBooksData();
    const newBook = {
        id: Date.now(),
        name: fileName,
        path: filePath,
        pages: totalPages,
        completed: false
    };

    books.push(newBook);
    saveBooksData(books);
    return books;
});

// Get all books on load
ipcMain.handle('get-books', () => {
    return loadBooksData();
});

// Launch book in Reader
ipcMain.on('open-book', (event, filePath) => {
    const command = `start "" "${filePath}"`;
    exec(command, (err) => {
        if (err) console.error("Failed to open file:", err);
    });
});

// Toggle complete status
ipcMain.handle('toggle-complete', (event, id) => {
    let books = loadBooksData();
    books = books.map(b => b.id === id ? { ...b, completed: !b.completed } : b);
    saveBooksData(books);
    return books;
});

// Delete book from list
ipcMain.handle('delete-book', (event, id) => {
    let books = loadBooksData();
    books = books.filter(b => b.id !== id);
    saveBooksData(books);
    return books;
});