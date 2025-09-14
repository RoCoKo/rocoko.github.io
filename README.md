# Steam Library Benchmark

Steam kütüphanenizdeki oyunların donanım gereksinimlerini analiz eden web uygulaması.

## Özellikler

- 🎮 Steam kütüphanenizdeki tüm oyunları analiz eder
- 💻 Donanım gereksinimlerini puanlar
- 🔄 Online/Offline backend desteği
- 📊 Detaylı benchmark sonuçları
- 🌐 GitHub Pages ile frontend hosting

## Kurulum ve Çalıştırma

### Backend (Node.js + Express)

1. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

2. **Backend'i başlatın:**
   ```bash
   npm start
   ```
   
   Veya geliştirme modu için:
   ```bash
   npm run dev
   ```

3. **Backend varsayılan olarak `http://localhost:3000` adresinde çalışır.**

### Frontend (GitHub Pages)

Frontend otomatik olarak GitHub Pages'de yayınlanır. Backend çalışırken:
- ✅ **Backend Online** - Hızlı ve güvenilir API
- ❌ **Backend Offline** - Proxy servisleri kullanılır

## Kullanım

1. Steam 64-bit ID'nizi girin
2. "Başlat" butonuna tıklayın
3. Oyunlarınız analiz edilir ve puanlanır

### Steam ID Nasıl Bulunur?

1. [Steam ID Finder](https://steamidfinder.com/) sitesine gidin
2. Steam kullanıcı adınızı girin
3. 17 haneli Steam ID'nizi kopyalayın

## API Endpoints

### Backend API

- `GET /api/health` - Backend durumu
- `GET /api/steam/games/:steamid` - Steam oyunları
- `GET /api/steam/game/:appid` - Oyun detayları

### Örnek Kullanım

```javascript
// Backend durumu
fetch('http://localhost:3000/api/health')

// Steam oyunları
fetch('http://localhost:3000/api/steam/games/76561198000000000')

// Oyun detayları
fetch('http://localhost:3000/api/steam/game/730')
```

## Teknik Detaylar

### Backend
- **Node.js + Express** - API sunucusu
- **CORS** - Cross-origin istekler
- **Axios** - HTTP istekleri
- **Steam API** - Oyun verileri

### Frontend
- **Vanilla JavaScript** - ES6 modülleri
- **CSS3** - Modern tasarım
- **GitHub Pages** - Hosting

### Özellikler
- **Fallback Sistemi** - Backend offline olduğunda proxy kullanır
- **Rate Limiting** - API limitlerini aşmaz
- **Error Handling** - Hata yönetimi
- **Caching** - Performans optimizasyonu

## Geliştirme

### Backend Geliştirme
```bash
npm run dev  # Nodemon ile otomatik yeniden başlatma
```

### Frontend Geliştirme
1. `index.html` dosyasını tarayıcıda açın
2. Backend'i `http://localhost:3000` adresinde çalıştırın
3. Değişiklikleri test edin

## Sorun Giderme

### Backend Çalışmıyor
- Node.js yüklü mü kontrol edin
- Port 3000 kullanımda mı kontrol edin
- `npm install` komutunu çalıştırın

### Frontend Backend'e Bağlanamıyor
- Backend çalışıyor mu kontrol edin
- CORS ayarları doğru mu kontrol edin
- Tarayıcı konsolunda hata var mı kontrol edin

### Steam API Hataları
- Steam ID doğru mu kontrol edin
- Steam profiliniz herkese açık mı kontrol edin
- API key geçerli mi kontrol edin

## Lisans

MIT License - Detaylar için `LICENSE` dosyasına bakın.

## Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## İletişim

- GitHub: [@rocoko](https://github.com/rocoko)
- Steam: [Steam Profil](https://steamcommunity.com/id/rocoko)