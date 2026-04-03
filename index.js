const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { findRmaInSheet } = require('./sheets');
const http = require('http'); // Aggiunto per Keep-Alive (Replit)
require('dotenv').config();

// Configurazione
const GROUP_NAME = process.env.GROUP_NAME || 'TestBotJS';
const PORT = process.env.PORT || 8080;
const DOWNLOAD_DIR = path.resolve(__dirname, 'downloads');

// Validazione Variabili d'Ambiente
const REQUIRED_ENV = ['SPREADSHEET_ID', 'SHEET_NAME'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(`[ERRORE] Variabili d'ambiente mancanti: ${missingEnv.join(', ')}`);
    console.error('Assicurati di averle configurate nel file .env o nel pannello di controllo dell\'host.');
    process.exit(1);
}

// Assicura che la cartella download esista
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

/**
 * Funzione OCR Base (Versione 1.0 - Stabile)
 * Ora integrata con Google Sheets
 */
async function processOCR(imagePath, msg) {
    console.log(`[OCR] Avvio analisi: ${path.basename(imagePath)}...`);
    try {
        const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
        
        // Regex per Sales Order (R seguita da 10-12 cifre)
        const regex = /R\d{10,12}/g;
        const matches = text.match(regex) || [];
        
        if (matches.length > 0) {
            const rmaCode = matches[0];
            console.log(`\n************************************`);
            console.log(`[CODICE RILEVATO]: ${rmaCode}`);
            console.log(`************************************\n`);

            // --- Ricerca in Google Sheets ---
            const sheetResult = await findRmaInSheet(rmaCode);
            if (sheetResult.success) {
                await client.sendMessage(msg.from, sheetResult.message);
            } else {
                console.log(`[SHEETS] Notifica soppressa: ${sheetResult.message}`);
            }
            
            return rmaCode;
        } else {
            console.log(`[OCR] Nessun codice rilevato nello scan base.`);
            return null;
        }
    } catch (err) {
        console.error('[OCR] Errore durante l\'analisi:', err);
        return null;
    }
}

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.resolve(__dirname, '.wwebjs_auth')
    }),
    puppeteer: {
        headless: true,
        // Using environment variable from Dockerfile or common Linux paths
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-gpu', 
            '--disable-dev-shm-usage', 
            '--no-zygote'
        ]
    }
});



client.on('qr', (qr) => {
    console.log('Scansiona il QR code:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client WhatsApp pronto e connesso!');
});

client.on('message', async (msg) => {
    // Gestione messaggi nel gruppo target
    const chat = await msg.getChat();
    if (chat.isGroup && chat.name === GROUP_NAME && msg.hasMedia) {
        console.log(`[MEDIA] Ricevuto da: ${msg.author || msg.from}`);
        
        try {
            const media = await msg.downloadMedia();
            if (media) {
                const extension = media.mimetype.split('/')[1].split(';')[0];
                const filename = `media_${Date.now()}.${extension}`;
                const fullPath = path.join(DOWNLOAD_DIR, filename);

                fs.writeFileSync(fullPath, media.data, { encoding: 'base64' });
                console.log(`[FILE SALVATO] ${filename}`);

                // Abbiamo rimosso il messaggio 'ok' automatico su richiesta
                
                // Analisi OCR
                await processOCR(fullPath, msg);
            }
        } catch (err) {
            console.error('[ERRORE] Impossibile gestire il media:', err);
        }
    }
});

console.log('Inizializzazione bot...');
client.initialize();

// Mini server per Keep-Alive (Necessario per Back4app Health Check)
http.createServer((req, res) => {
    res.write('Bot is running!');
    res.end();
}).listen(PORT, () => {
    console.log(`[SERVER] Health check in ascolto sulla porta ${PORT}`);
});

