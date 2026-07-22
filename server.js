require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stringSimilarity = require('string-similarity');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Statik dosyaları (index.html, style.css, script.js) sunmak için
app.use(express.static(path.join(__dirname))); 

const SHEET_URL = process.env.GOOGLE_SHEET_URL;

function turkceTemizle(metin) {
    return metin.toLowerCase().trim().replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

// Ham veriyi çeken yardımcı fonksiyon
async function getRawData() {
    try {
        const response = await fetch(SHEET_URL);
        const csvText = await response.text();
        const satirlar = csvText.split(/\r?\n/).slice(1);
        return satirlar.filter(s => s.trim()).map(s => {
            const sutunlar = s.split(',').map(col => col.replace(/^"|"$/g, '').trim());
            return { isim: sutunlar[0], durum: sutunlar[1] || "Serbest" };
        });
    } catch (e) { return []; }
}

// 1. Arama Rotası
app.get('/api/sorgula', async (req, res) => {
    let { isim } = req.query;
    if (!isim) return res.json({ durum: "Serbest", oneri: "" });

    const dataList = await getRawData();
    const veriTabani = dataList.reduce((acc, item) => ({ ...acc, [item.isim.toLowerCase()]: item.durum }), {});
    
    let durum = "Serbest";
    let oneri = "";
    const arananIsimNormal = isim.trim().toLowerCase();
    
    if (veriTabani[arananIsimNormal]) {
        durum = veriTabani[arananIsimNormal];
        oneri = isim.trim();
    } else {
        const keys = Object.keys(veriTabani);
        const temizKeys = keys.map(turkceTemizle);
        const matches = stringSimilarity.findBestMatch(turkceTemizle(isim), temizKeys);
        
        if (matches.bestMatch.rating >= 0.40) {
            const enIyiEslesmeOrijinal = keys[matches.bestMatchIndex];
            durum = veriTabani[enIyiEslesmeOrijinal];
            oneri = enIyiEslesmeOrijinal;
        }
    }
    res.json({ durum, oneri });
});

// 2. Yeni Liste Rotası
app.get('/api/liste-verileri', async (req, res) => {
    const data = await getRawData();
    const sonEklenenler = data.slice(-5).reverse();
    res.json({ sonEklenenler, tumListe: data });
});

// 3. Feedback (Geri Bildirim) Rotası
app.post('/api/feedback', async (req, res) => {
    const { isim, mesaj } = req.body;
    
    if (!isim || !mesaj) {
        return res.status(400).json({ success: false, message: "Eksik bilgi." });
    }

    // Geri bildirimi konsola yazdırıyoruz. İstersen buraya Google Sheets'e otomatik 
    // satır ekleme (Google Sheets API veya Google Apps Script Web App) entegre edebilirsin.
    console.log(`[YENİ BİLDİRİM] Kişi: ${isim} | Mesaj/Öneri: ${mesaj}`);
    
    res.status(200).json({ success: true, message: "Bildirim alındı." });
});

// ANA ROTA: index.html dosyasını döndürür
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor.`);
});