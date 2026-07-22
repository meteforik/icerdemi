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
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby47saESO4kA38f3UsZMPmlx8ty-k7ndphRL7WGvvZB4OkJKxHnO5FreWW13GU3CPQZ8Q/exec';

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
    
    // Önce tam eşleşme var mı diye kesin kontrol edelim
    if (veriTabani[arananIsimNormal]) {
        durum = veriTabani[arananIsimNormal];
        oneri = isim.trim();
    } else {
        // Tam eşleşme yoksa benzerlik oranına bakalım, eşik: %75 (0.75)
        const keys = Object.keys(veriTabani);
        const temizKeys = keys.map(turkceTemizle);
        const matches = stringSimilarity.findBestMatch(turkceTemizle(isim), temizKeys);
        
        if (matches.bestMatch.rating >= 0.75) {
            const enIyiEslesmeOrijinal = keys[matches.bestMatchIndex];
            durum = veriTabani[enIyiEslesmeOrijinal];
            oneri = enIyiEslesmeOrijinal;
        } else {
            durum = "Serbest";
            oneri = "";
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

    try {
        // Google Apps Script Web App'e POST isteği gönderiyoruz
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isim, mesaj })
        });

        console.log(`[BİLDİRİM KAYDEDİLDİ] Kişi: ${isim} | Mesaj: ${mesaj}`);
        res.status(200).json({ success: true, message: "Bildirim tabloya eklendi." });
    } catch (error) {
        console.error("Feedback gönderilirken hata oluştu:", error);
        res.status(500).json({ success: false, message: "Sunucu hatası." });
    }
});

// ANA ROTA: index.html dosyasını döndürür
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor.`);
});