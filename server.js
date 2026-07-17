require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stringSimilarity = require('string-similarity');

const app = express();
app.use(cors());
app.use(express.json());

const SHEET_URL = process.env.GOOGLE_SHEET_URL;

function turkceTemizle(metin) {
    return metin.toLowerCase().trim().replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

// Ham veriyi çeken yardımcı fonksiyon
async function getRawData() {
    try {
        const response = await fetch(SHEET_URL);
        const csvText = await response.text();
        const satirlar = csvText.split(/\r?\n/).slice(1); // Başlık satırını atla
        return satirlar.filter(s => s.trim()).map(s => {
            const sutunlar = s.split(',').map(col => col.replace(/^"|"$/g, '').trim());
            return { isim: sutunlar[0], durum: sutunlar[1] || "Serbest" };
        });
    } catch (e) { return []; }
}

// 1. Arama Rotası
app.get('/api/sorgula', async (req, res) => {
    let { isim } = req.query;
    const dataList = await getRawData();
    const veriTabani = dataList.reduce((acc, item) => ({ ...acc, [item.isim.toLowerCase()]: item.durum }), {});
    
    let durum = "Serbest";
    const arananIsimNormal = isim.trim().toLowerCase();
    
    if (veriTabani[arananIsimNormal]) {
        durum = veriTabani[arananIsimNormal];
    } else {
        const matches = stringSimilarity.findBestMatch(turkceTemizle(isim), Object.keys(veriTabani).map(turkceTemizle));
        if (matches.bestMatch.rating >= 0.65) {
            durum = veriTabani[Object.keys(veriTabani)[matches.bestMatchIndex]];
        }
    }
    res.json({ durum });
});

// 2. Yeni Liste Rotası (Ana Sayfadaki listeler için)
app.get('/api/liste-verileri', async (req, res) => {
    const data = await getRawData();
    
    // Son eklenenler (Listenin en altındaki 5 kişi)
    const sonEklenenler = data.slice(-5).reverse();
    
    // "Popüler" olanlar (Burada logic: Eğer durumları "İçeride" ise veya özel bir işaret varsa alabiliriz)
    // Şimdilik listeyi olduğu gibi döndürüyorum, sen ön yüzde istediğini filtreleyebilirsin.
    res.json({ sonEklenenler, tumListe: data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Sunucu çalışıyor.`);
});