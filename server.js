require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stringSimilarity = require('string-similarity');

const app = express();
app.use(cors());
app.use(express.json());

const SHEET_URL = process.env.GOOGLE_SHEET_URL;

// Google verilerini sunucunun hafızasında (RAM) tutacağımız lokal değişken
let hafizadakiVeriTabani = {};

function turkceTemizle(metin) {
    return metin
        .toLowerCase()
        .trim()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
}

// Google Sheets'ten verileri arka planda çeken fonksiyon
async function guncelleVeriTabani() {
    try {
        if (!SHEET_URL) {
            console.error("❌ HATA: .env dosyasında GOOGLE_SHEET_URL tanımlanmamış!");
            return;
        }

        const response = await fetch(SHEET_URL);
        if (!response.ok) throw new Error(`Google sunucusu hata döndürdü: ${response.status}`);
        
        const csvText = await response.text();
        
        if (csvText.includes("<!DOCTYPE html>") || csvText.includes("<html")) {
            console.error("❌ HATA: Google Sheets linki yanlış! CSV formatında yayınlandığından emin olun.");
            return;
        }

        const satirlar = csvText.split(/\r?\n/);
        const yeniVeriTabani = {};

        for (let i = 0; i < satirlar.length; i++) {
            if (!satirlar[i].trim()) continue;
            
            const sutunlar = satirlar[i].split(',').map(s => s.replace(/^"|"$/g, '').trim());
            
            if (sutunlar.length >= 2) {
                const isim = sutunlar[0].toLowerCase().trim();
                const durum = sutunlar[1].trim();
                
                if (isim && durum && isim !== "isim" && isim !== "name" && durum !== "durum" && durum !== "status") {
                    yeniVeriTabani[isim] = durum;
                }
            }
        }

        // Hafızadaki eski veriyi en güncel veriyle değiştiriyoruz
        hafizadakiVeriTabani = yeniVeriTabani;
        console.log(`🔄 [HAFIZA GÜNCELLENDİ] Google Sheets başarıyla senkronize edildi. Toplam Kayıt: ${Object.keys(hafizadakiVeriTabani).length}`);
    } catch (error) {
        console.error("❌ Tablo arka planda güncellenirken hata oluştu:", error.message);
    }
}

// SİSTEM İLK AÇILDIĞINDA VERİLERİ BİR KERE ÇEK
guncelleVeriTabani();

// HER 5 DAKİKADA BİR (300000 ms) ARKA PLANDA OTOMATİK GÜNCELLE
// Sen kodla veya sunucuyla uğraşmazsın, o arkada Google'dan yeni isimleri sessizce çeker.
setInterval(guncelleVeriTabani, 300000);


app.get('/api/sorgula', (req, res) => {
    let { isim } = req.query;

    if (!isim) {
        return res.status(400).json({ error: "Lütfen bir isim belirtin." });
    }

    const arananIsimNormal = isim.trim().toLowerCase();
    const arananIsimTemiz = turkceTemizle(isim);

    let durum = "Serbest";

    // ARTIK INTERNETE GİTMİYORUZ! Doğrudan RAM'deki değişkeni kontrol ediyoruz (Işık hızı)
    const listedekiIsimler = Object.keys(hafizadakiVeriTabani);

    if (listedekiIsimler.length > 0) {
        // 1. AŞAMA: Birebir veya Kısmi Eşleşme Kontrolü
        if (hafizadakiVeriTabani[arananIsimNormal]) {
            durum = hafizadakiVeriTabani[arananIsimNormal];
        } else {
            const bulunanAnahtar = listedekiIsimler.find(key => key.includes(arananIsimNormal) || arananIsimNormal.includes(key));
            
            if (bulunanAnahtar) {
                durum = hafizadakiVeriTabani[bulunanAnahtar];
            } else {
                // 2. AŞAMA: Akıllı Harf Hatası Kontrolü
                const temizListedekiIsimler = listedekiIsimler.map(isim => turkceTemizle(isim));
                const matches = stringSimilarity.findBestMatch(arananIsimTemiz, temizListedekiIsimler);
                const enYakinEslenme = matches.bestMatch;

                if (enYakinEslenme.rating >= 0.65) {
                    const orijinalIsimIndex = matches.ratings.findIndex(r => r.target === enYakinEslenme.target);
                    const gercekAnahtar = listedekiIsimler[orijinalIsimIndex];
                    durum = hafizadakiVeriTabani[gercekAnahtar];
                }
            }
        }
    }

    res.json({ durum });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Işık hızında (RAM Önbellekli) Sunucu http://localhost:${PORT} üzerinde hazır.`);
});