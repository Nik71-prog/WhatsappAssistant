require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Caricamento credenziali
const creds = JSON.parse(fs.readFileSync('./service_account.json'));

const serviceAccountAuth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);

/**
 * Funzione per cercare e aggiornare il foglio Google
 */
async function findRmaInSheet(rmaCode) {
    console.log(`[SHEETS] Connessione al foglio per ricerca: ${rmaCode}...`);
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle[process.env.SHEET_NAME];
        if (!sheet) {
            throw new Error(`Foglio "${process.env.SHEET_NAME}" non trovato!`);
        }

        // Carichiamo tutte le righe
        const rows = await sheet.getRows();
        const today = new Date().toLocaleDateString('it-IT'); // Formato Giorno/Mese/Anno o come preferito

        let targetRow = null;

        // Cerchiamo la riga che contiene il codice RMA nella colonna E (indice 4)
        for (const row of rows) {
            // Usiamo _rawData per compatibilità con l'approccio ad indici del Python
            const rowValues = row._rawData;
            const rmaInRow = rowValues[4] || "";

            if (rmaInRow.includes(rmaCode)) {
                targetRow = row;
                break;
            }
        }

        if (targetRow) {
            const rowValues = targetRow._rawData;
            const componente = rowValues[2] || "-";
            const cliente = rowValues[3] || "-";
            const tipo = rowValues[6] || "-";

            // Abbiamo rimosso la parte di aggiornamento su richiesta (Sola lettura)
            console.log(`[SHEETS] Codice trovato, salto l'aggiornamento.`);

            return {
                success: true,
                message: `${cliente}`,
                data: { componente, cliente, tipo }
            };
        }

        return { success: false, message: `Codice ${rmaCode} non trovato.` };
    } catch (err) {
        console.error('[SHEETS] Errore critico:', err.message);
        return { success: false, message: `Errore nel sistema.` };
    }
}

module.exports = { findRmaInSheet };
