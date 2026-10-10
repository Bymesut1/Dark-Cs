// ============================================================
//  okru — Nuvio scraper (ok.ru/video, kullanıcı yüklemeleri)
//  Akış: TMDB bilgisi -> ok.ru araması -> aday eleme/puanlama (mailru ile aynı)
//        -> video sayfası metadata -> mp4 / HLS linkleri
//  Sadece TÜRKÇE SES (TR / TR Dublaj / Türkçe Dublaj / tr / TR Dual) akışları gösterilir.
// ============================================================

var AYAR = {
  SITE: 'https://ok.ru',
  EKLENTI_ADI: 'ok.ru',
  // true iken akış çıkmazsa neden çıkmadığını yazan "DEBUG" satırları görünür. Her şey çalışınca false yap.
  DEBUG_MODU: false,
  MAX_ADAY: 8,     // en fazla kaç aday video için kaynak çekilsin
  MAX_SORGU: 16,   // en fazla kaç arama yapılsın (öncelik sırasıyla)
  MAX_SAYFA: 0,
  ONEKLER: [],
  MANUEL: [        // { tmdb: 123, adlar: ['Film Adı'], yil: 2000, dosya: 'sitedeki.tam.baslik', id: 'ok.ru video numarası' }
                   // tmdb + id varsa: arama/TMDB beklenmeden, bağımsız ve tekrar denemeli şekilde KESİN eklenir
    // tmdb 218 = The Terminator (1984). Aynı filme birden çok dosya verilebilir; ayakta olan hepsi listelenir.
    { tmdb: 218, adlar: ['The Terminator', 'Terminator', 'Terminatör'], yil: 1984, dosya: 'Terminator.1.1984.TR.1080p', id: '1766021532169' },
    { tmdb: 218, adlar: ['The Terminator', 'Terminator', 'Terminatör'], yil: 1984, dosya: 'Terminator.1.1984.1080p.BluRay.x264.TR', id: '1050987137588' },
    { tmdb: 218, adlar: ['The Terminator', 'Terminator', 'Terminatör'], yil: 1984, dosya: 'Terminator.1.1984-Filmsarayi.net', id: '1189269146174' }
  ],
  ENGEL: [],
  HESAPLAR: ['https://ok.ru/profile/590041294398/video'],   // yükleyen hesap (sude can): video listesi aday olarak taranır
  // Bu hesabın herkese açık listesindeki videolar (ağ yanıt vermese de aday olarak girer; Türkçe kabul edilir)
  HESAP_KATALOG: [
    { id: '1189269146174', title: 'Terminator.1.1984-Filmsarayi.net', dur: 6433 },
    { id: '1150481009214', title: 'Fs.Dngl', dur: 9661 }
  ],
  PARALEL: 4,          // aynı anda en fazla kaç arama/liste isteği (yavaş ağda zaman aşımını önler)
  HESAP_SAYFA: 0,
  BELIRSIZ_GOSTER: true,  // dili doğrulanamayan adaylar "Dil ?" etiketiyle en sona eklensin
  MAX_BELIRSIZ: 5,
  ARAMA_SURESI: 8000,  // ms
  GENEL_SURE: 12000,    // ms
  KAYNAK_SURESI: 3500  // ms
};

// Türkçe adı TMDB'de görünmeyen / farklı yazılan filmler: orijinal ad (harf-rakam, küçük) -> Türkçe adlar
var TR_ALIAS = {
  'nationaltreasure': ['Harbi Define'],
  'nationaltreasurebookofsecrets': ['Harbi Define 2'],
  'thebutterflyeffect': ['Kelebek Etkisi'],
  'thebutterflyeffect2': ['Kelebek Etkisi 2'],
  'thebutterflyeffect3revelations': ['Kelebek Etkisi 3'],
  'themummy': ['Mumya'],
  'themummyreturns': ['Mumya Geri Dönüyor', 'Mumya 2'],
  'themummytombofthedragonemperor': ['Mumya 3', 'Mumya Ejderha İmparatorunun Mezarı'],
  'diehard': ['Zor Ölüm'],
  'diehard2': ['Zor Ölüm 2'],
  'diehardwithavengeance': ['Zor Ölüm 3'],
  'livefreeordiehard': ['Zor Ölüm 4', 'Zor Ölüm 4.0'],
  'agooddaytodiehard': ['Zor Ölüm 5'],
  'insidious': ['Ruhlar Bölgesi'],
  'insidiouschapter2': ['Ruhlar Bölgesi Bölüm 2', 'Ruhlar Bölgesi 2'],
  'insidiouschapter3': ['Ruhlar Bölgesi Bölüm 3', 'Ruhlar Bölgesi 3'],
  'insidiousthelastkey': ['Ruhlar Bölgesi Son Anahtar', 'Ruhlar Bölgesi 4'],
  'insidioustheredddoor': ['Ruhlar Bölgesi Kırmızı Kapı', 'Ruhlar Bölgesi 5'],
  'insidiousthereddoor': ['Ruhlar Bölgesi Kırmızı Kapı', 'Ruhlar Bölgesi 5']
};

// Ek Türkçe adlar: [orijinal/İngilizce ad, [Türkçe adlar...]]. Yükleyenler hem resmi adı hem "yabancı + Türkçe karışık" adı kullanır.
var TR_ALIAS_EK = [
  ['The Terminator', ['Terminatör', 'Terminator']],
  ['Terminator 2: Judgment Day', ['Terminatör 2: Mahşer Günü', 'Terminatör 2: Kıyamet Günü', 'Terminator 2 Kıyamet Günü', 'Terminatör 2']],
  ['Terminator 3: Rise of the Machines', ['Terminatör 3: Makinelerin Yükselişi', 'Terminator 3 Makinelerin Yükselişi', 'Terminatör 3']],
  ['Terminator Salvation', ['Terminatör Kurtuluş', 'Terminator Kurtuluş', 'Terminatör 4']],
  ['Terminator Genisys', ['Terminatör Genisys', 'Terminatör 5']],
  ['Terminator: Dark Fate', ['Terminatör Kara Kader', 'Terminatör Kader', 'Terminator Dark Fate']],
  ['Home Alone', ['Evde Tek Başına']],
  ['Home Alone 2: Lost in New York', ['Evde Tek Başına 2', 'Evde Tek Başına 2 New York\'ta Kayıp']],
  ['Pirates of the Caribbean: The Curse of the Black Pearl', ['Karayip Korsanları Siyah İnci\'nin Laneti', 'Karayip Korsanları 1']],
  ['Pirates of the Caribbean: Dead Man\'s Chest', ['Karayip Korsanları Ölü Adamın Sandığı', 'Karayip Korsanları 2']],
  ['Pirates of the Caribbean: At World\'s End', ['Karayip Korsanları Dünyanın Sonu', 'Karayip Korsanları 3']],
  ['Pirates of the Caribbean: On Stranger Tides', ['Karayip Korsanları Gizemli Denizlerde', 'Karayip Korsanları 4']],
  ['Pirates of the Caribbean: Dead Men Tell No Tales', ['Karayip Korsanları Salazar\'ın İntikamı', 'Karayip Korsanları 5']],
  ['The Lord of the Rings: The Fellowship of the Ring', ['Yüzüklerin Efendisi Yüzük Kardeşliği', 'Yüzüklerin Efendisi 1']],
  ['The Lord of the Rings: The Two Towers', ['Yüzüklerin Efendisi İki Kule', 'Yüzüklerin Efendisi 2']],
  ['The Lord of the Rings: The Return of the King', ['Yüzüklerin Efendisi Kralın Dönüşü', 'Yüzüklerin Efendisi 3']],
  ['The Hobbit: An Unexpected Journey', ['Hobbit Beklenmedik Yolculuk', 'Hobbit 1']],
  ['The Hobbit: The Desolation of Smaug', ['Hobbit Smaug\'un Çorak Toprakları', 'Hobbit 2']],
  ['The Hobbit: The Battle of the Five Armies', ['Hobbit Beş Ordunun Savaşı', 'Hobbit 3']],
  ['Harry Potter and the Philosopher\'s Stone', ['Harry Potter ve Felsefe Taşı', 'Harry Potter 1']],
  ['Harry Potter and the Sorcerer\'s Stone', ['Harry Potter ve Felsefe Taşı', 'Harry Potter 1']],
  ['Harry Potter and the Chamber of Secrets', ['Harry Potter ve Sırlar Odası', 'Harry Potter 2']],
  ['Harry Potter and the Prisoner of Azkaban', ['Harry Potter ve Azkaban Tutsağı', 'Harry Potter 3']],
  ['Harry Potter and the Goblet of Fire', ['Harry Potter ve Ateş Kadehi', 'Harry Potter 4']],
  ['Harry Potter and the Order of the Phoenix', ['Harry Potter ve Zümrüdüanka Yoldaşlığı', 'Harry Potter 5']],
  ['Harry Potter and the Half-Blood Prince', ['Harry Potter ve Melez Prens', 'Harry Potter 6']],
  ['Harry Potter and the Deathly Hallows: Part 1', ['Harry Potter ve Ölüm Yadigârları Bölüm 1', 'Harry Potter 7']],
  ['Harry Potter and the Deathly Hallows: Part 2', ['Harry Potter ve Ölüm Yadigârları Bölüm 2', 'Harry Potter 8']],
  ['The Fast and the Furious', ['Hızlı ve Öfkeli', 'Hızlı ve Öfkeli 1']],
  ['2 Fast 2 Furious', ['Daha Hızlı Daha Öfkeli', 'Hızlı ve Öfkeli 2']],
  ['The Fast and the Furious: Tokyo Drift', ['Hızlı ve Öfkeli Tokyo Yarışı', 'Hızlı ve Öfkeli 3']],
  ['Fast & Furious', ['Hızlı ve Öfkeli 4']],
  ['Fast Five', ['Hızlı ve Öfkeli 5']],
  ['Fast & Furious 6', ['Hızlı ve Öfkeli 6']],
  ['Furious 7', ['Hızlı ve Öfkeli 7']],
  ['The Fate of the Furious', ['Hızlı ve Öfkeli 8']],
  ['Mission: Impossible', ['Görevimiz Tehlike']],
  ['Mission: Impossible II', ['Görevimiz Tehlike 2']],
  ['Mission: Impossible III', ['Görevimiz Tehlike 3']],
  ['Mission: Impossible - Ghost Protocol', ['Görevimiz Tehlike Hayalet Protokol', 'Görevimiz Tehlike 4']],
  ['The Godfather', ['Baba']],
  ['The Godfather Part II', ['Baba 2']],
  ['The Godfather Part III', ['Baba 3']],
  ['Pulp Fiction', ['Ucuz Roman']],
  ['Fight Club', ['Dövüş Kulübü']],
  ['Gladiator', ['Gladyatör']],
  ['The Shawshank Redemption', ['Esaretin Bedeli']],
  ['Inception', ['Başlangıç']],
  ['Batman Begins', ['Batman Başlıyor']],
  ['The Dark Knight', ['Kara Şövalye']],
  ['The Dark Knight Rises', ['Kara Şövalye Yükseliyor']],
  ['Interstellar', ['Yıldızlararası']],
  ['The Avengers', ['Yenilmezler']],
  ['Avengers: Age of Ultron', ['Yenilmezler Ultron Çağı']],
  ['Avengers: Infinity War', ['Yenilmezler Sonsuzluk Savaşı']],
  ['Avengers: Endgame', ['Yenilmezler Son Oyun', 'Yenilmezler 4 Son Oyun']],
  ['Saving Private Ryan', ['Er Ryan\'ı Kurtarmak']],
  ['Catch Me If You Can', ['Sıkıysa Yakala']],
  ['Shutter Island', ['Zindan Adası']],
  ['The Prestige', ['Prestij']],
  ['Se7en', ['Yedi', 'Seven']],
  ['The Silence of the Lambs', ['Kuzuların Sessizliği']],
  ['The Lion King', ['Aslan Kral']],
  ['Finding Nemo', ['Kayıp Balık Nemo']],
  ['Finding Dory', ['Kayıp Balık Dory']],
  ['Toy Story', ['Oyuncak Hikayesi']],
  ['Toy Story 2', ['Oyuncak Hikayesi 2']],
  ['Toy Story 3', ['Oyuncak Hikayesi 3']],
  ['Toy Story 4', ['Oyuncak Hikayesi 4']],
  ['Ice Age', ['Buz Devri']],
  ['Taken', ['Kiralık Katil']],
  ['Taken 2', ['Kiralık Katil 2']],
  ['Taken 3', ['Kiralık Katil 3']],
  ['Now You See Me', ['Sihirbazlar Çetesi']],
  ['Now You See Me 2', ['Sihirbazlar Çetesi 2']],
  ['The Hangover', ['Felekten Bir Gece']],
  ['The Hangover Part II', ['Felekten Bir Gece 2']],
  ['The Hangover Part III', ['Felekten Bir Gece 3']],
  ['Man of Steel', ['Çelik Adam']],
  ['Black Swan', ['Siyah Kuğu']],
  ['A Beautiful Mind', ['Akıl Oyunları']],
  ['Scarface', ['Yüzü Yaralı Adam']],
  ['Dances with Wolves', ['Kurtlarla Dans']],
  ['Braveheart', ['Cesur Yürek']],
  ['Blade Runner', ['Bıçak Sırtı']],
  ['Gone Girl', ['Kayıp Kız']],
  ['Memento', ['Akıl Defteri']],
  ['American Beauty', ['Amerikan Güzeli']],
  ['The Green Mile', ['Yeşil Yol']],
  ['Taxi Driver', ['Taksi Şoförü']],
  ['The Departed', ['Köstebek']],
  ['Django Unchained', ['Zincirsiz']],
  ['Inglourious Basterds', ['Soysuzlar Çetesi']],
  ['The Wolf of Wall Street', ['Para Avcısı']],
  ['The Revenant', ['Diriliş']],
  ['Gravity', ['Yerçekimi']],
  ['Mad Max: Fury Road', ['Çılgın Max Öfkeli Yollar']],
  ['Spider-Man', ['Örümcek Adam']],
  ['Spider-Man 2', ['Örümcek Adam 2']],
  ['Spider-Man 3', ['Örümcek Adam 3']],
  ['The Amazing Spider-Man', ['Muhteşem Örümcek Adam']],
  ['Spider-Man: Homecoming', ['Örümcek Adam Eve Dönüş']],
  ['Spider-Man: Far From Home', ['Örümcek Adam Eve Uzak']],
  ['Spider-Man: No Way Home', ['Örümcek Adam Eve Dönüş Yok']],
  ['RoboCop', ['Robot Polis']],
  ['Lethal Weapon', ['Ölümcül Silah']],
  ['Lethal Weapon 2', ['Ölümcül Silah 2']],
  ['Lethal Weapon 3', ['Ölümcül Silah 3']],
  ['First Blood', ['Rambo İlk Kan', 'Rambo 1']],
  ['Con Air', ['Kaçış Uçağı']],
  ['The Rock', ['Kaya']],
  ['Raiders of the Lost Ark', ['Kayıp Hazine Avcıları', 'Indiana Jones Kayıp Hazine Avcıları']],
  ['Indiana Jones and the Temple of Doom', ['Indiana Jones ve Ölüm Tapınağı']],
  ['Indiana Jones and the Last Crusade', ['Indiana Jones ve Son Macera']],
  ['Rain Man', ['Yağmur Adam']],
  ['The Pursuit of Happyness', ['Umudunu Kaybetme']],
  ['Eternal Sunshine of the Spotless Mind', ['Sil Baştan']],
  ['Good Will Hunting', ['Can Dostum']],
  ['Dead Poets Society', ['Ölü Ozanlar Derneği']],
  ['Life Is Beautiful', ['Hayat Güzeldir']],
  ['The Pianist', ['Piyanist']],
  ['Schindler\'s List', ['Schindler\'in Listesi']],
  ['The Usual Suspects', ['Olağan Şüpheliler']],
  ['Seven Pounds', ['Yedi Ruh']],
  ['Despicable Me', ['Çılgın Hırsız']],
  ['Despicable Me 2', ['Çılgın Hırsız 2']],
  ['Minions', ['Minyonlar']],
  ['How to Train Your Dragon', ['Ejderhanı Nasıl Eğitirsin']],
  ['Cars', ['Arabalar']],
  ['Monsters, Inc.', ['Sevimli Canavarlar']],
  ['The Incredibles', ['İnanılmaz Aile']],
  ['Up', ['Yukarı Bak']],
  ['Ratatouille', ['Ratatuy']],
  ['Inside Out', ['Ters Yüz']],
  ['Frozen', ['Karlar Ülkesi']],
  ['Tangled', ['Karmakarışık']],
  ['Zootopia', ['Zootropolis']],
  ['Night at the Museum', ['Müzede Bir Gece']],
  ['Sherlock Holmes: A Game of Shadows', ['Sherlock Holmes Gölge Oyunları']],
  ['Prince of Persia: The Sands of Time', ['Pers Prensi Zamanın Kumları']],
  ['I Am Legend', ['Ben Efsaneyim']],
  ['The Notebook', ['Not Defteri']],
  ['Troy', ['Truva']],
  ['300', ['300 Spartalı']],
  ['Clash of the Titans', ['Titanların Savaşı']],
  ['Wrath of the Titans', ['Titanların Öfkesi']],
  ['Kill Bill: Vol. 1', ['Kill Bill Bölüm 1']],
  ['Kill Bill: Vol. 2', ['Kill Bill Bölüm 2']],
  // --- Yüklenen dosya adlarında görülen Türkçe adlar (ekran görüntüleri) ---
  ['National Treasure', ['Büyük Hazine', 'Büyük Hazine 1']],
  ['National Treasure: Book of Secrets', ['Büyük Hazine 2', 'Büyük Hazine Sırlar Kitabı']],
  ['Rush Hour', ['Bitirim İkili', 'Bitirim İkili 1']],
  ['Rush Hour 2', ['Bitirim İkili 2']],
  ['Rush Hour 3', ['Bitirim İkili 3']],
  ['The Mummy Returns', ['Mumya Dönüyor']],
  ['The Time Machine', ['Zaman Tüneli', 'Zaman Makinesi']],
  ['Home Alone 3', ['Evde Tek Başına 3']],
  ['Rambo: First Blood Part II', ['Rambo 2 İlk Kan', 'Rambo İlk Kan 2', 'Rambo 2']],
  ['Rambo III', ['Rambo 3']],
  ['Rambo', ['Rambo 4']],
  ['Rambo: Last Blood', ['Rambo 5', 'Rambo Son Kan']],
  ['The Transporter|Transporter', ['Taşıyıcı', 'Taşıyıcı 1']],
  ['Transporter 2', ['Taşıyıcı 2']],
  ['Transporter 3', ['Taşıyıcı 3']],
  ['The Transporter Refueled|Transporter Refueled', ['Taşıyıcı Son Hız']],
  ['District B13|Banlieue 13', ['Banliyö 13']],
  ['District 13: Ultimatum|Banlieue 13: Ultimatum|Banlieue 13 - Ultimatum', ['Banliyö 13 Ültimatom']],
  ['Spy Kids', ['Çılgın Çocuklar', 'Çılgın Çocuklar 1']],
  ['Spy Kids 2: Island of Lost Dreams|Spy Kids 2: The Island of Lost Dreams', ['Çılgın Çocuklar 2']],
  ['Spy Kids 3-D: Game Over', ['Çılgın Çocuklar 3']],
  ['The Bourne Identity', ['Geçmişi Olmayan Adam', 'Geçmişi Olmayan Adam 1', 'Bourne Kimliği']],
  ['The Bourne Supremacy', ['Geçmişi Olmayan Adam 2', 'Bourne Üstünlüğü']],
  ['The Bourne Ultimatum', ['Geçmişi Olmayan Adam 3', 'Bourne Ültimatom']],
  ['The Bourne Legacy', ['Geçmişi Olmayan Adam 4', 'Bourne Mirası']],
  ['Jason Bourne', ['Geçmişi Olmayan Adam 5']],
  ['Blade', ['Blade 1']],
  ['Blade II', ['Blade 2']],
  ['Blade: Trinity', ['Blade 3', 'Blade Trinity']],
  ['Back to the Future', ['Geleceğe Dönüş', 'Geleceğe Dönüş Bölümü I']],
  ['Back to the Future Part II', ['Geleceğe Dönüş 2', 'Geleceğe Dönüş Bölümü II']],
  ['Back to the Future Part III', ['Geleceğe Dönüş 3', 'Geleceğe Dönüş Bölümü III']],
  ['Ghost Rider', ['Hayalet Sürücü', 'Hayalet Sürücü 1']],
  ['Ghost Rider: Spirit of Vengeance', ['Hayalet Sürücü 2']],
  ['The Mask', ['Maske', 'Maske 1']],
  ['Son of the Mask', ['Maske 2']],
  ['The Mask of Zorro', ['Maskeli Kahraman Zorro', 'Zorro 1']],
  ['The Legend of Zorro', ['Zorro 2', 'Maskeli Kahraman Zorro 2', 'Zorro Efsanesi']],
  ['A Nightmare on Elm Street', ['Elm Sokağında Kabus', 'Elm Sokağında Kabus 1']],
  ["A Nightmare on Elm Street 2: Freddy's Revenge", ['Elm Sokağında Kabus 2']],
  ['A Nightmare on Elm Street 3: Dream Warriors', ['Elm Sokağında Kabus 3']],
  ['A Nightmare on Elm Street 4: The Dream Master', ['Elm Sokağında Kabus 4', 'Elm Sokağında Kabus 4 Rüya Ustası']],
  ['A Nightmare on Elm Street 5: The Dream Child', ['Elm Sokağında Kabus 5']],
  ['Army of Darkness', ['Karanlığın Ordusu']],
  ['The Matrix', ['Matrix', 'Matrix 1']],
  ['The Matrix Reloaded', ['Matrix 2', 'Matrix Reloaded']],
  ['The Matrix Revolutions', ['Matrix 3', 'Matrix Revolutions']],
  ['The Sixth Sense', ['Altıncı His']],
  ['A.I. Artificial Intelligence', ['Yapay Zeka']],
  ['Signs', ['İşaretler']],
  ['The Invasion', ['İstila']],
  ['Twelve Monkeys|12 Monkeys', ['12 Maymun', 'On İki Maymun']],
  ['The Thing', ['Şey']],
  ['Journey to the Center of the Earth', ['Dünyanın Merkezine Yolculuk', 'Dünya Merkezine Yolculuk']],
  ['The Medallion', ['Madalyon']],
  ['The Island', ['Ada']],
  ['Triangle', ['Şeytan Üçgeni']],
  ['Frequency', ['Frekans']],
  ['Groundhog Day', ['Bugün Aslında Dündü']],
  ['Bruce Almighty', ['Aman Tanrım']],
  ['Evan Almighty', ['Aman Tanrım 2']],
  ['Small Soldiers', ['Küçük Askerler']],
  ['Get Smart', ['Akıllı Ol']],
  ["Baby's Day Out", ['Bebek Firarda']],
  ['The Invention of Lying', ['Yalanın İcadı']],
  ['Undisputed II: Last Man Standing', ['Yenilmez 2']],
  ['Undisputed', ['Yenilmez']],
  ['Black Lightning', ['Kara Yıldırım']],
  ['Wrong Turn', ['Bilinmeyen Yol']],
  ['Scary Movie', ['Korkunç Bir Film', 'Korkunç Bir Film 1']],
  ['Scary Movie 2', ['Korkunç Bir Film 2']],
  ['Scary Movie 3', ['Korkunç Bir Film 3']],
  ['Scary Movie 4', ['Korkunç Bir Film 4']],
  ['Fantastic Four', ['Fantastik Dörtlü']],
  ['Fantastic 4: Rise of the Silver Surfer', ['Fantastik Dörtlü Gümüş Sörfçü', 'Fantastik Dörtlü 2']],
  ['Zathura: A Space Adventure', ['Zathura Bir Uzay Macerası']],
  ['Hard Target', ['Zor Hedef']],
  ['Timeline', ['Zaman Yolcusu', 'Zaman Yolcu']],
  ["Snake in the Eagle's Shadow", ['Kartalın Gölgesindeki Yılan']],
  ['Fast Five', ['Hızlı Beş']],
  ['Aladdin', ['Alaaddin']],
  ["A Kid in Aladdin's Palace", ["Alaaddin'in Sarayı", "Alaaddin'in Sarayında Bir Çocuk"]],
  ['The Tuxedo', ['Smokin']]
];
TR_ALIAS_EK.forEach(function (p) {
  p[0].split('|').forEach(function (nm) {
    var k = nm.toLowerCase().replace(/[^a-z0-9]/g, '');
    TR_ALIAS[k] = (TR_ALIAS[k] || []).concat(p[1].filter(function (n) { return (TR_ALIAS[k] || []).indexOf(n) === -1; }));
  });
});

var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var PROVIDER_ID = 'okru';
var ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36';

var dbg = [];
function log(m) { try { console.log('[okru] ' + m); } catch (e) {} }

// ---------------- Yardımcılar ----------------

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); },
                 function (e) { clearTimeout(t); reject(e); });
  });
}

function pageHeaders(extra) {
  var h = {
    'User-Agent': ANDROID_UA,
    'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8,ru;q=0.5',
    'Referer': AYAR.SITE + '/video'
  };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

// Aynı anda çok sayıda büyük istek yavaş ağda hepsini zaman aşımına sokuyor: normal istekler sıraya girer,
// video kaynağı ('V' ile başlayan etiket) istekleri öncelikli olup sıraya girmez.
var NET_ACTIVE = 0, NET_QUEUE = [];
function netAcquire(prio) {
  return new Promise(function (resolve) {
    if (prio || NET_ACTIVE < (AYAR.PARALEL || 4)) { NET_ACTIVE++; resolve(true); return; }
    NET_QUEUE.push({ t: Date.now(), r: resolve });
  });
}
function netRelease() {
  NET_ACTIVE = Math.max(0, NET_ACTIVE - 1);
  while (NET_QUEUE.length && NET_ACTIVE < (AYAR.PARALEL || 4)) {
    var w = NET_QUEUE.shift();
    if (Date.now() - w.t > 7000) { w.r(false); continue; }   // çok bekledi: vazgeç
    NET_ACTIVE++; w.r(true); break;
  }
}

// { status, ok, text, cookie, url }  — opt: { method, body, timeout, prio }
function getRaw(url, headers, label, opt) {
  opt = opt || {};
  var prio = !!opt.prio || /^V/.test(label || '');
  var tmo = opt.timeout || (prio ? 8000 : 5000);
  return netAcquire(prio).then(function (granted) {
    if (!granted) return { status: 0, ok: false, text: '', cookie: '', err: 'sira' };
    var init = { headers: headers || pageHeaders() };
    if (opt.method) init.method = opt.method;
    if (opt.body) init.body = opt.body;
    return withTimeout(fetch(url, init), tmo).then(function (res) {
      var cookie = '';
      try {
        var sc = res.headers && res.headers.get && res.headers.get('set-cookie');
        var m = String(sc || '').match(/video_key=([^;,\s]+)/);
        if (m) cookie = m[1];
      } catch (e) {}
      return withTimeout(res.text(), tmo).then(
        function (t) { return { status: res.status, ok: res.ok, text: t || '', cookie: cookie, url: res.url || '' }; },
        function () { return { status: res.status, ok: false, text: '', cookie: cookie, url: res.url || '' }; }
      );
    }).catch(function (e) {
      return { status: 0, ok: false, text: '', cookie: '', err: (e && e.message) || 'hata' };
    }).then(function (r) { netRelease(); return r; });
  }).then(function (r) {
    if (label) dbg.push(label + ' ' + (r.status || r.err || '?') + '/' + r.text.length);
    return r;
  });
}

function getJson(url) {
  return withTimeout(fetch(url), 10000).then(function (res) { return res.json(); });
}

function decodeHtml(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

var TR_MAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
function asciiLower(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase()
    .replace(/[çğıöşüâîû]/g, function (c) { return TR_MAP[c]; });
}
function norm(s) { return asciiLower(s).replace(/[^a-z0-9]/g, ''); }
// Türkçe harfleri sadeleştir (büyük/küçük harf korunur): "Zor Ölüm" -> "Zor Olum"
var TR_PLAIN = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' };
function plain(s) { return String(s || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, function (c) { return TR_PLAIN[c]; }); }
// Ünsüz iskeleti: "Captain Phillips" ~ "Kptn.Phlps" (yükleyen kısaltmış)
function skel(s) {
  return asciiLower(s).replace(/[^a-z0-9]/g, '').replace(/c/g, 'k').replace(/[aeiou]/g, '').replace(/(.)\1+/g, '$1');
}
function hasTrChars(s) { return /[çğışöüÇĞİŞÖÜ]/.test(String(s || '')); }
// Hepsi bitince ya da süre dolunca devam et (biten sonuçlar kullanılır, bitmeyenler atlanır)
function waitWithin(promises, ms) {
  return new Promise(function (resolve) {
    var left = promises.length, done = false;
    if (!left) { resolve(); return; }
    var t = setTimeout(function () { if (!done) { done = true; resolve(); } }, ms);
    promises.forEach(function (p) {
      p.then(function () {}, function () {}).then(function () {
        left--;
        if (left === 0 && !done) { done = true; clearTimeout(t); resolve(); }
      });
    });
  });
}
// En az `need` iş bitince (ya da hepsi bitince / süre dolunca) devam et
function waitSome(promises, need, ms) {
  return new Promise(function (resolve) {
    var n = promises.length, finished = 0, done = false;
    if (!n) { resolve(); return; }
    need = Math.min(need, n);
    var t = setTimeout(function () { if (!done) { done = true; resolve(); } }, ms);
    promises.forEach(function (p) {
      p.then(function () {}, function () {}).then(function () {
        finished++;
        if (finished >= need && !done) { done = true; clearTimeout(t); resolve(); }
      });
    });
  });
}
function aliasNames(list) {
  var out = [];
  list.forEach(function (t) { var a = TR_ALIAS[norm(t)]; if (a) out = out.concat(a); });
  return uniq(out);
}

function uniq(list) {
  var out = [];
  list.forEach(function (x) { if (x && out.indexOf(x) === -1) out.push(x); });
  return out;
}

function lev(a, b) {
  if (a === b) return 0;
  var prev = [], cur = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur = [i];
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
// "future" ~ "furure" (yükleyenin yazım hatası): 5+ harfli kelimelerde 1 harf farkı kabul
function looseEq(a, b) {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1 && lev(a, b) <= 1;
}

// ---------------- Başlık analizi ----------------

var STOP_WORDS = { the: 1, a: 1, an: 1, of: 1, and: 1, ve: 1, ile: 1, film: 1, filmi: 1, izle: 1, movie: 1 };
var ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
var NOISE = {};
['bluray', 'brrip', 'bdrip', 'webrip', 'webdl', 'web', 'dl', 'hdrip', 'hdtv', 'dvdrip', 'x264', 'x265', 'h264', 'h265',
 'hevc', 'aac', 'ac3', 'dts', 'dual', 'tr', 'en', 'eng', 'turkce', 'turkish', 'trdub', 'dublaj', 'dublajli', 'altyazi',
 'altyazili', 'sub', 'subs', 'full', 'hd', 'fhd', 'uhd', 'multi', 'ar', 'arabic', 'arapca', 'imax', 'extended',
 'remastered', 'proper', 'repack', '3dfi', 'yify', 'rarbg', 'mkv', 'mp4', 'avi', 'hdr', 'english', 'ingilizce', 'dub',
 'subtitle', 'subtitles', 'bluray1080p', 'hd1080p', 'video', 'tek', 'parca', 'part',
 'mpv', 'mkv', 'mov', 'm4v', 'wmv', 'flv', 'bolum', 'bolumu', 'kisim', 'kismi',
 'xvid', 'divx', 'oped', 'otuk', 'otuke', 'direkizleyin', 'com', 'org', 'net', 'www', 'x26', 'dvd', 'bdrip',
 'cift', 'nf', 'amzn', 'dsnp', 'hmax', 'eski', 'yeni', 'seri', 'serisi', 'koleksiyon', 'fullhdfilm', 'hdfilm', 'filmizle', 'izlesene']
  .forEach(function (w) { NOISE[w] = 1; });

// Aranan başlıktan anlamlı kelimeler (TMDB tarafı)
function sigTokens(s) {
  var words = [], nums = [];
  asciiLower(s).split(/[^a-z0-9]+/).forEach(function (t) {
    if (!t) return;
    if (/^\d{1,2}$/.test(t)) { nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { nums.push(ROMAN[t]); return; }
    if (STOP_WORDS[t]) return;
    words.push(t);
  });
  return { words: words, nums: nums };
}

// Yüklenen dosya adı: tt0088763.Back.to.the.Future.Part.I.1985.1080p.TR.dual
var GLUE_TAGS = ['dublaj', 'izle', 'tr'];
var NO_DIGIT_SPLIT = /^(part|disc|disk|kisim|bolum|season|sezon|mpeg|divx|xvid|dolby|atmos|hevc|dts|aac|ddp)$/;
// Dosya adı parçası -> gerçek parçalar. Yükleyenlerin bitişik yazımları:
//   "Başına2" -> basina 2 | "efsanetr" -> efsane tr | "57556kartalin" -> kartalin | "m1080ptr" -> 1080p tr | "1x" -> 1
//   "tt.57556" / "tt5967" gibi sahte IMDb numaraları atılır
function splitTok(t, depth) {
  var m;
  depth = depth || 0;
  if (t === 'tt' || t === 'ttt' || /^ttt?\d{3,5}$/.test(t)) return [];
  if (/^\d{5,7}$/.test(t)) return [];
  m = t.match(/^m?(2160|1080|720|480|360)p(tr|dual|dublaj|turkce|izle|hd|sub)?$/);
  if (m) return m[2] ? [m[1] + 'p', m[2]] : [m[1] + 'p'];
  m = t.match(/^(\d{1,4})(tr|trdub|trdublaj|dublaj|dual|turkce|altyazi|altyazili)$/) ||
      t.match(/^(tr|trdub|trdublaj|dublaj|dual|turkce)(\d{1,2})$/) ||
      t.match(/^(\d{3,4}p?|tr|dublaj|dublajli|turkce|hd|full|film|tek|parca|bolum)(izle)$/);
  if (m) return [m[1], m[2]];
  m = t.match(/^(tr|en|eng)(sub|subs|altyazi)$/);                          // "TRSub" = Türkçe ALTYAZI (ses Türkçe değil)
  if (m) return [m[1], 'sub'];
  m = t.match(/^(\d{4,7})([a-z]{3,})$/);
  if (m) return splitTok(m[1], depth + 1).concat(splitTok(m[2], depth + 1));
  m = t.match(/^(\d{1,2})x$/);
  if (m) return [m[1]];
  m = t.match(/^([a-z]{4,})(\d{1,2})$/);
  if (m && !NO_DIGIT_SPLIT.test(m[1])) return splitTok(m[1], depth + 1).concat([m[2]]);
  if (depth < 2) {
    for (var i = 0; i < GLUE_TAGS.length; i++) {
      var g = GLUE_TAGS[i];
      if (t.length - g.length >= 4 && t.slice(-g.length) === g) return [t.slice(0, -g.length), g];
    }
  }
  return [t];
}

function analyze(title) {
  var raw = String(title || '')
    .replace(/\s*[\(\[]\s*\d\s*[\)\]]\s*$/, '')                      // "Film (1)": kopya numarası
    .replace(/\bsayfa\s*\d+/gi, ' ')                               // "... - Sayfa 3" site sayfası, sıra numarası değil
    .replace(/(^|[^0-9])[257][.,][01](?![0-9])/g, '$1');             // ses düzeni 5.1 / 7.1 / 2.0 sıra numarası sanılmasın
  var toks = [];
  asciiLower(raw.replace(/\?/g, '_')).split(/[^a-z0-9_]+/).filter(Boolean).forEach(function (t) {   // '?' = okunamayan harf (joker)
    splitTok(t).forEach(function (x) { if (x) toks.push(x); });
  });
  var info = { imdb: '', years: [], res: 0, tags: {}, words: [], nums: [], part: 0, bag: toks };
  toks.forEach(function (t, idx) {
    var m;
    if (t === 'x' && idx === toks.length - 1) { info.tags[t] = 1; return; }   // kesilmiş "x264" (Roman 10 sanılmasın)
    if (/^tt\d{6,9}$/.test(t)) { info.imdb = t; return; }
    if (/^(19|20)\d{2}$/.test(t)) { info.years.push(parseInt(t, 10)); return; }
    m = t.match(/^(2160|1080|720|480|360)p$/);
    if (m) { info.res = Math.max(info.res, parseInt(m[1], 10)); return; }
    if (t === '4k') { info.res = Math.max(info.res, 2160); return; }
    m = t.match(/^(?:cd|disc|disk|pt|part|kisim)(\d)$/);
    if (m) { info.part = parseInt(m[1], 10); return; }
    if (NOISE[t] || /dublaj|turkce|altyaz|dual/.test(t)) { info.tags[t] = 1; return; }
    if (/^\d{1,2}$/.test(t)) { info.nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { info.nums.push(ROMAN[t]); return; }
    if (STOP_WORDS[t]) return;
    info.words.push(t);
  });
  info.joined = toks.join('');
  return info;
}

// Türkçe ek toleransı: "Bourneun" ~ "Bourne", "Yolcu" ~ "Yolcusu", "Maske" ~ "Mask"
var TR_SUF = /^(i|u|a|e|s|n|si|su|in|un|an|en|ya|ye|yi|yu|da|de|ta|te|ler|lar|leri|lari|nin|nun|dan|den|tan|ten|nda|nde|ndan|nden|ni|na|ne|ndaki)$/;
function sufEq(a, b) {
  var s = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a;
  return s.length >= 4 && l.length > s.length && l.length - s.length <= 5 && l.indexOf(s) === 0 && TR_SUF.test(l.slice(s.length));
}
function wildEq(a, b) {                       // b'deki '_' = bir (veya hiç) harf: "saray_" ~ "sarayi"
  if (b.indexOf('_') < 0 || a.indexOf('_') > -1 || a.length < 4) return false;
  try { return new RegExp('^' + b.replace(/_/g, '.?') + '$').test(a); } catch (e) { return false; }
}
function tokEq(w, b) { return looseEq(w, b) || sufEq(w, b) || wildEq(w, b); }
// Garanti listesi: site başlığı beklenen dosya adıyla aynı mı? ('?' joker)
function sameTitle(title, expectedNorm) {
  var pat = asciiLower(String(title || '').replace(/\?/g, '_')).replace(/[^a-z0-9_]/g, '').replace(/_/g, '[a-z0-9]?');
  try { return new RegExp('^' + pat + '$').test(expectedNorm); } catch (e) { return false; }
}

function noApos(wants) {                   // "Nim's Island" ~ dosyada "Nims.Island"
  var out = wants.slice();
  wants.forEach(function (w) { var x = String(w || '').replace(/['’`]/g, ''); if (x !== w) out.push(x); });
  return out;
}

function nameMatch(info, wants) {
  wants = noApos(wants);
  for (var i = 0; i < wants.length; i++) {
    var sw = sigTokens(wants[i]), ww = sw.words;
    if (!ww.length) continue;
    var covered = ww.every(function (w) {
      return info.bag.some(function (b) { return tokEq(w, b); });
    });
    if (!covered) {
      // bitişik yazım: "SpiderMan.Homecoming" ~ "Spider-Man: Homecoming", "YapayZeka" ~ "Yapay Zeka"
      var wn = norm(wants[i]);
      if (wn.length >= 6 && info.joined && info.joined.indexOf(wn) > -1) return true;
      continue;
    }
    // kısa başlıklar ("Up", "It"): dosya adı başka kelimelerle dolu ise başka film olabilir
    if (ww.length <= 2 && info.words.length > ww.length * 3) continue;
    // sıra numarası çakışıyorsa (Taken 2 / Taken 3) reddet
    if (sw.nums.length && info.nums.length) {
      var common = sw.nums.some(function (n) { return info.nums.indexOf(n) > -1; });
      if (!common) continue;
    } else if (!sw.nums.length && !info.imdb && info.nums.some(function (n) { return n >= 2 && n <= 20; })) {
      continue;                     // aranan adda sayı yok ama dosyada "2/3/4.." var: devam filmi (Maske.2, Evde Tek Başına2)
    }
    return true;
  }
  return false;
}

// Birebir ad: dosya adındaki her kelime aranan addan, sıra numaraları da aynı (yıl yanlış yazılmış olsa bile güvenli)
function exactTitle(info, wants) {
  wants = noApos(wants);
  for (var i = 0; i < wants.length; i++) {
    var sw = sigTokens(wants[i]), ww = sw.words;
    if (!ww.length) continue;
    if (!ww.every(function (w) { return info.bag.some(function (b) { return tokEq(w, b); }); })) continue;
    var extra = info.words.filter(function (b) { return !ww.some(function (w) { return tokEq(w, b); }); });
    if (extra.length) continue;
    if (sw.nums.slice().sort().join(',') === info.nums.slice().sort().join(',')) return true;
  }
  return false;
}

// Kısmi ad eşleşmesi: aranan kelimelerin en az yarısı (içinde 5+ harfli biri) dosya adında geçiyor.
// Sadece yıl TAM tutuyor ve süre ±%6 içindeyse kabul edilir (Yenilmezler: Endgame ~ Yenilmezler Son Oyun).
function partialName(info, wants) {
  for (var i = 0; i < wants.length; i++) {
    var ww = sigTokens(wants[i]).words;
    if (!ww.length) continue;
    var hit = 0, long = false, anchor = false;
    ww.forEach(function (w) {
      if (info.bag.some(function (b) { return tokEq(w, b); })) { hit++; if (w.length >= 5) long = true; if (w.length >= 8) anchor = true; }
    });
    if (long && hit / ww.length >= 0.5) return true;
    if (anchor) return true;       // "Terminator" gibi ayırt edici tek kelime (yıl + süre şartıyla)
  }
  return false;
}

// Bulanık anahtar kelime: aranan addaki 5+ harfli bir kelime, dosya adındaki bir kelimeye en fazla 2 harf farkla benziyor
// (Aladdin ~ Alaaddin). Tek başına yetmez; süre birebir (±%1.2) ve yıl uyumu da gerekir.
function fuzzyHit(info, wants) {
  var cand = info.bag.filter(function (b) { return b.length >= 5 && !/^\d/.test(b); });
  for (var i = 0; i < wants.length; i++) {
    var ww = sigTokens(wants[i]).words.filter(function (w) { return w.length >= 5; });
    for (var j = 0; j < ww.length; j++) {
      for (var k = 0; k < cand.length; k++) {
        var a = ww[j], b = cand[k];
        if (tokEq(a, b)) return true;
        if (a.length >= 7 && b.length >= 7 && Math.abs(a.length - b.length) <= 2 && lev(a, b) <= 2) return true;
      }
    }
  }
  return false;
}

// Ünsüz iskeleti eşleşmesi (Kptn.Phlps ~ Captain Phillips). Sadece yıl TAM + süre ±%6 ise kabul edilir.
function skelMatch(info, wants) {
  var js = skel(info.joined || '');
  for (var i = 0; i < wants.length; i++) {
    var ww = sigTokens(wants[i]).words;
    if (!ww.length) continue;
    var sk = skel(ww.join(''));
    if (sk.length >= 6 && js.indexOf(sk) > -1) return true;
  }
  return false;
}

// Ses parçası bilgisinde Türkçe geçiyor mu (mail.ru meta JSON'unda ses/dil alanları)
function metaTurkishAudio(m) {
  var found = false, KEY = /audio|track|dub|voice|sound|language/i, VAL = /^(tr|tur|trk|turkish|turkce|türkçe)$/i;
  function walk(o, key, depth) {
    if (found || o === null || o === undefined || depth > 6) return;
    if (typeof o === 'string') { if (key && VAL.test(o.trim())) found = true; return; }
    if (typeof o !== 'object') return;
    Object.keys(o).forEach(function (k) {
      if (k === 'videos') return;
      walk(o[k], KEY.test(k) ? k : key, depth + 1);
    });
  }
  try { walk((m && m.raw) || (m && m.meta) || {}, '', 0); } catch (e) {}
  return found;
}

// Dil etiketi. Sadece TÜRKÇE SES kabul edilir:
//   TR / TR Dublaj / Türkçe Dublaj / TR Dual  -> ok (tier 0)
//   TR Altyazı (ses orijinal), sadece Dual, EN, RU, AR, ... -> ok değil
function langInfo(info) {
  var keys = Object.keys(info.tags).concat(info.bag);
  function any(re) { return keys.some(function (k) { return re.test(k); }); }
  var tr = any(/^tr$|^trk$|^tur$|^turk$|^turkiye$|turkce|turkish|dublaj|^trdub|^trdubl|^tr(dublaj|dublajli|dual|hd|1080p|720p)$/);
  var dual = any(/dual|^cift$/);
  var dublaj = any(/dublaj|^trdub|^dubl/);
  var sub = any(/altyaz|^sub$|^subs$|subtitle/);
  var foreign = any(/^(rus|russian|rusca|ru|ukr|ukrainian|ger|german|deu|fre|french|fra|spa|spanish|ita|italian|hin|hindi|kor|korean|jpn|japanese|chi|chinese|pol|por|arabic|ar|arapca|farsi|persian)$/);
  var en = any(/^en$|^eng$|^english$|ingilizce/);
  var dubOnly = any(/^dub$/) && !foreign && !en;          // "Dub.Frekans"
  if (dubOnly) { tr = true; dublaj = true; }
  var izle = any(/^izle$/);                       // "izle", "tr izle", "izle.avi", "720pizle" ...
  if (tr && dublaj) return { label: 'TR Dublaj', tier: 0, ok: true, foreign: foreign, sub: sub, en: en };
  if (tr && dual) return { label: 'TR Dual', tier: 0, ok: true, foreign: foreign, sub: sub, en: en };
  if (tr && sub) return { label: 'TR Altyazı', tier: 5, ok: false, foreign: foreign, sub: true, en: en };
  if (tr) return { label: 'TR', tier: 0, ok: true, foreign: foreign, sub: sub, en: en };
  // "izle" etiketli (Türkçe sitelerin adlandırması) ve yabancı dil / altyazı / EN etiketi yoksa Türkçe say
  if (izle && !foreign && !sub && !en) return { label: 'TR İzle', tier: 1, ok: true, foreign: foreign, sub: sub, en: en };
  return { label: dual ? 'Dual' : sub ? 'Altyazı' : foreign ? 'Yabancı' : en ? 'EN' : '?', tier: 5, ok: false, foreign: foreign, sub: sub, en: en };
}

// Puanlama: null = ele, yoksa { score, info }
function rankItem(item, ctx) {
  if (ctx.engel && ctx.engel.some(function (e) { return sameTitle(item.title, e); })) return null;   // engelli dosya
  if (ctx.manuel && ctx.manuel.some(function (e) { return sameTitle(item.title, e); })) {          // garanti listesindeki dosya
    return { score: 999, info: analyze(item.title), lang: 'TR', tier: 0, maybe: false };
  }
  var info = analyze(item.title);
  var imdbOk = !!(info.imdb && info.imdb === ctx.imdb);
  var nameOk = nameMatch(info, ctx.wants);
  if (info.imdb && ctx.imdb && info.imdb !== ctx.imdb) {                   // başka IMDb numarası: ad + yıl TAM tutuyorsa yükleyen numarayı yanlış yazmış olabilir
    if (!(nameOk && ctx.year && info.years.indexOf(ctx.year) > -1)) return null;
  }
  var partial = false, skelOk = false;
  var tight = !!(item.dur && ctx.runtime && Math.abs(item.dur / (ctx.runtime * 60) - 1) <= 0.012);
  if (!imdbOk && !nameOk) {
    if (partialName(info, ctx.wants)) partial = true;
    else if (skelMatch(info, ctx.wants)) skelOk = true;
    else if (tight && fuzzyHit(info, ctx.wants)) partial = true;     // süre birebir + en az bir uzun kelime benzer
    else return null;
  }
  var loose = partial || skelOk;   // zayıf ad eşleşmesi: yıl + süre şart

  // Süre neredeyse birebir (±%1.2): ad dilden dile farklı yazılsa bile (Aladdin ~ Alaaddin) parmak izi olarak aday sayılır
  var score = 0;
  if (imdbOk) score += 100;
  if (nameOk) score += 20;
  if (loose) score += 10;
  if (nameOk && !info.years.length && exactTitle(info, ctx.wants)) score += 10;   // yıl yazılmamış ama ad birebir

  if (info.years.length && ctx.year) {
    var yd = 99;
    info.years.forEach(function (y) { yd = Math.min(yd, Math.abs(y - ctx.year)); });
    if (loose && yd !== 0) return null;
    if (yd === 0) score += 30;
    else if (yd === 1) score += 15;
    else if (!imdbOk) {                                                   // farklı yıl = devam filmi/başka film ...
      // ... ama ad BİREBİR, sıra numarası aynı, süre ±%20 ve yıl en fazla 8 fark ise yükleyen yılı yanlış yazmıştır
      //     (Harbi.Define.2010, Zorro.2.2008)
      var relax = nameOk && yd <= 8 && item.dur && ctx.runtime &&
                  Math.abs(item.dur / (ctx.runtime * 60) - 1) <= 0.2 && exactTitle(info, ctx.wants);
      if (!relax) return null;
      score += 20;
    }
    else score -= 10;
  }

  if (item.dur) {
    if (ctx.runtime) {
      var r = item.dur / (ctx.runtime * 60), d = Math.abs(r - 1);
      if (loose && d > 0.06) return null;
      if (d <= 0.06) score += 25;
      else if (d <= 0.15) score += 10;
      else if (d <= 0.3) score += 0;                                      // uzatılmış/kısaltılmış kurgu
      else if (info.part && r >= 0.25 && r <= 0.75) score += 0;           // CD1/CD2 parçası
      else return null;                                                   // fragman, kesit, özet
    } else if (item.dur < 1500) {
      return null;
    }
  }

  if (loose) {                                                         // zayıf eşleşme: süre ŞART; yıl yoksa süre ±%3
    if (!item.dur) return null;
    if (!info.years.length) {
      var r0 = ctx.runtime ? Math.abs(item.dur / (ctx.runtime * 60) - 1) : 1;
      if (r0 > 0.03) return null;
    }
  }
  var li = langInfo(info);
  if (/[\u0400-\u04FF]/.test(item.title) && !li.ok) return null;       // Rusça (Kiril) başlık
  if (!li.ok && ctx.trFilm && !li.foreign) li = { label: 'TR Yerli', tier: 0, ok: true };   // yerli Türk filmi: ses zaten Türkçe
  var maybe = false;
  if (!li.ok) {
    var clean = !li.foreign && !li.sub && !li.en;                        // başka dil / altyazı / EN etiketi yok
    var trNameOk = !!(ctx.trWants && ctx.trWants.length && nameMatch(info, ctx.trWants));
    var trChars = hasTrChars(item.title);
    if (clean && li.label === '?' && (trNameOk || trChars)) {
      // Etiket yok ama Türkçe adla ya da Türkçe harflerle yazılmış: Türkçe say
      // (yıl yoksa süre ±%8 içinde olmalı; başka filmle karışmasın)
      var rr = (ctx.runtime && item.dur) ? Math.abs(item.dur / (ctx.runtime * 60) - 1) : 1;
      if (!imdbOk && !info.years.length && rr > 0.08) return null;
      li = { label: trChars ? 'TR Yazı' : 'TR Ad', tier: 1, ok: true };
    } else if (clean && (li.label === '?' || li.label === 'Dual') && (imdbOk || nameOk || tight)) {
      maybe = true;                                                      // ses parçası meta bilgisinden doğrulanacak
      li = { label: 'TR Ses', tier: 2, ok: true };
    } else return null;                                                  // EN / RU / AR / altyazılı
  }
  if (info.res >= 2160) score += 4; else if (info.res >= 1080) score += 3; else if (info.res >= 720) score += 2;

  if (score < 40) return null;
  return { score: score, info: info, lang: li.label, tier: li.tier, maybe: maybe };
}

// ---------------- Arama sonucu ayrıştırma ----------------

function parseDuration(s) {
  var p = String(s || '').trim().split(':');
  if (p.length < 2 || p.length > 3) return 0;
  var n = 0;
  for (var i = 0; i < p.length; i++) n = n * 60 + (parseInt(p[i], 10) || 0);
  return n;
}

// ok.ru arama sayfası: sayfadaki JSON bloklarında (data-props vb.) film kayıtlarını bul
function walkMovies(o, add, depth) {
  if (!o || typeof o !== 'object' || depth > 9) return;
  if (Array.isArray(o)) { o.forEach(function (x) { walkMovies(x, add, depth + 1); }); return; }
  if (o.movie && typeof o.movie === 'object' && o.movie.id) add(o.movie);
  else if (o.id && /^\d{8,}$/.test(String(o.id)) && (o.title || o.name) && (o.duration || o.thumbnail || o.thumbnailUrl || o.poster || o.imageUrl)) add(o);
  Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') walkMovies(o[k], add, depth + 1); });
}

function parseSearch(html) {
  var out = [], seen = {};
  html = String(html || '');
  function add(m) {
    if (!m || !m.id || seen[m.id]) return;
    var title = decodeHtml(String(m.title || m.name || '')).trim();
    if (!title) return;
    seen[m.id] = true;
    var d = Number(m.duration) || 0;               // ok.ru arama sonucunda süre milisaniye
    out.push({ path: '/video/' + m.id, id: String(m.id), durText: '', dur: d ? Math.round(d / 1000) : 0, title: title });
  }
  var re0 = /data-(?:props|options|module|state)="([^"]+)"/g, m0;
  while ((m0 = re0.exec(html)) !== null) {
    try { walkMovies(JSON.parse(decodeHtml(m0[1])), add, 0); } catch (e) {}
  }
  if (!out.length) {
    var dec = decodeHtml(html), re2 = /"movie":\{[^{}]{0,800}?"id":"?(\d{8,})"?[^{}]{0,800}?"title":"([^"]{2,200})"/g, m2;
    while ((m2 = re2.exec(dec)) !== null) add({ id: m2[1], title: m2[2] });
    var re2b = /"id":"?(\d{8,})"?,"title":"([^"]{2,200})"/g, m2b;
    while ((m2b = re2b.exec(dec)) !== null) add({ id: m2b[1], title: m2b[2] });
  }
  if (!out.length) {
    var re1 = /href="\/video\/(\d{6,})[^"]*"[^>]*data-tsid="video-name">([^<]+)</g, m1;
    while ((m1 = re1.exec(html)) !== null) add({ id: m1[1], title: m1[2] });
  }
  if (!out.length) {
    var re3 = /href="(?:https?:\/\/ok\.ru)?\/video\/(\d{8,})[^"]*"[^>]*?(?:title|aria-label)="([^"]{2,200})"/g, m3;
    while ((m3 = re3.exec(html)) !== null) add({ id: m3[1], title: m3[2] });
  }
  if (!out.length) {
    var re4 = /href="(?:https?:\/\/ok\.ru)?\/video\/(\d{8,})[^"]*"[^>]*>\s*([^<]{3,150})</g, m4;
    while ((m4 = re4.exec(html)) !== null) add({ id: m4[1], title: m4[2] });
  }
  return out;
}

function accountsOf() { return []; }
function morePages(html, items) { return Promise.resolve(items); }

// Profil / hesap video listesi (sunucudan hazır gelen sayfa): her /video/<numara> için en yakın başlık ve süre
function parseProfile(html) {
  var h = String(html || ''), m, ids = [], seen = {}, titles = [], durs = [];
  var re = /\/video\/(\d{8,})/g;
  while ((m = re.exec(h)) !== null) { if (!seen[m[1]]) { seen[m[1]] = true; ids.push({ id: m[1], at: m.index }); } }
  var rt = /(?:alt|title|aria-label)="([^"]{2,200})"/g;
  while ((m = rt.exec(h)) !== null) {
    var t = decodeHtml(m[1]).trim();
    if (!t || t === '#' || /^(görüntüle|izle|video|videolar|kapat|logo|ok|oynat)$/i.test(t) || /^https?:/.test(t)) continue;
    titles.push({ at: m.index, t: t });
  }
  var rd = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;
  while ((m = rd.exec(h)) !== null) durs.push({ at: m.index, d: m[1] });
  function nearest(list, at, max) {
    var best = null, bd = max + 1;
    list.forEach(function (c) { var d = Math.abs(c.at - at) + (c.at > at ? 0.5 : 0); if (d < bd) { bd = d; best = c; } });   // eşitlikte öncekini seç
    return best;
  }
  return ids.map(function (x) {
    var tt = nearest(titles, x.at, 900), dd = nearest(durs, x.at, 700), sec = 0;
    if (dd) { var pp = dd.d.split(':').map(Number); sec = pp.length === 3 ? pp[0] * 3600 + pp[1] * 60 + pp[2] : pp[0] * 60 + pp[1]; }
    return { path: '/video/' + x.id, id: x.id, title: tt ? tt.t : '', durText: dd ? dd.d : '', dur: sec, guvenilir: true };
  }).filter(function (x) { return x.title; });
}

function katalogItems() {
  return (AYAR.HESAP_KATALOG || []).map(function (k) {
    return { path: '/video/' + k.id, id: String(k.id), title: k.title, durText: '', dur: k.dur || 0, guvenilir: true };
  });
}

// Hesap sayfasını getir, bulunan videoları sink'e ekle
function scanList(u, pages, sink, ai) {
  return getRaw(u, null, 'A' + ai).then(function (r) {
    var items = r.ok ? parseProfile(r.text) : [];
    if (r.ok) parseSearch(r.text).forEach(function (it) { it.guvenilir = true; items.push(it); });
    items.forEach(function (it) { sink.push(it); });
    return items;
  });
}

var SEARCH_URLS = [
  function (q) { return AYAR.SITE + '/video/search?st.cmd=video&st.m=SEARCH&st.ft=search&st.v.sq=' + q; },
  function (q) { return AYAR.SITE + '/video/search?st.cmd=anonymVideo&st.m=SEARCH&st.v.sq=' + q; },
  function (q) { return AYAR.SITE + '/video/showcase?st.v.sq=' + q; },
  function (q) { return AYAR.SITE + '/search?st.cmd=searchResult&st.mode=Movie&st.query=' + q; },
  function (q) { return AYAR.SITE + '/video/search?st.v.sq=' + q; },
  function (q) { return AYAR.SITE + '/dk?st.cmd=searchResult&st.mode=Movie&st.query=' + q; }
];

var UA_MASAUSTU = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function searchOnce(q, tag, pages, sink) {
  var enc = encodeURIComponent(q);
  // ilk 3 sorguda birkaç yöntem denenir, diğerlerinde sadece ilk yöntem (hız)
  var tries = tag <= 3
    ? [[3, true], [0, false], [4, true], [1, true], [5, true], [2, true]]
    : [[3, true]];
  var i = 0;
  function next() {
    if (i >= tries.length) return Promise.resolve([]);
    var t = tries[i++], u = SEARCH_URLS[t[0]](enc);
    return getRaw(u, pageHeaders(t[1] ? { 'User-Agent': UA_MASAUSTU } : null), 'S' + tag + '.' + i).then(function (r) {
      var items = r.ok ? parseSearch(r.text) : [];
      if (AYAR.DEBUG_MODU && tag <= 3) {
        var tx = r.text || '', cm = tx.match(/captcha|robot|consent|blocked|forbidden/i);
        dbg.push('q' + tag + '.' + i + ' url' + t[0] + ' st=' + r.status + ' len=' + tx.length + ' n=' + items.length +
          ' props=' + (tx.indexOf('data-props') > -1 ? 1 : 0) + ' vid=' + ((tx.match(/\/video\/\d{8,}/g) || []).length) +
          ' cap=' + (cm ? cm[0] : 0) + (items[0] ? ' ' + items[0].title.slice(0, 22) : ''));
        if (tag === 1 && i <= 2) {
          var tags = (tx.match(/<[a-z0-9-]+[^>]{0,200}data-props=/g) || []).slice(0, 5).map(function (x) { return x.match(/<([a-z0-9-]+)/)[1]; }).join(',');
          dbg.push('q1.' + i + ' tag: ' + tags + ' | title: ' + ((tx.match(/<title>([^<]{0,60})/) || [])[1] || '-'));
          var vi = tx.search(/\/video\/\d{8,}/);
          if (vi > -1) dbg.push('q1.' + i + ' ornek: ' + tx.slice(Math.max(0, vi - 40), vi + 90).replace(/\s+/g, ' '));
        }
      }
      if (items.length) { sink.push.apply(sink, items); return items; }
      return next();
    });
  }
  return next();
}

// ---------------- Video kaynağı ----------------

var OK_KALITE = { ultra: 2160, quad: 1440, full: 1080, hd: 720, sd: 480, low: 360, lowest: 240, mobile: 144 };

function buildMeta(md) {
  if (!md) return null;
  var vids = (md.videos || []).map(function (v) {
    var h = OK_KALITE[v.name] || 0;
    return { url: v.url, key: h ? h + 'p' : (v.name || '') };
  });
  var hls = md.hlsManifestUrl || md.hlsMasterPlaylistUrl || md.ondemandHls || '';
  if (!vids.length && !hls) return null;
  return { videos: vids, hls: hls, cookie: '', meta: md, raw: md };
}

function metaFromHtml(html) {
  var attrs = [], re = /data-options="([^"]+)"/g, m;
  while ((m = re.exec(html || '')) !== null) attrs.push(m[1]);
  for (var i = 0; i < attrs.length; i++) {
    if (attrs[i].indexOf('flashvars') === -1) continue;
    try {
      var opts = JSON.parse(decodeHtml(attrs[i]));
      var md = opts.flashvars && opts.flashvars.metadata;
      if (typeof md === 'string') md = JSON.parse(md);
      var b = buildMeta(md);
      if (b) return b;
    } catch (e) {}
  }
  return null;
}

function metaFromJson(text) {
  try {
    var j = JSON.parse(text), md = j;
    if (j && j.flashvars) md = j.flashvars.metadata;
    else if (j && j.metadata) md = j.metadata;
    if (typeof md === 'string') md = JSON.parse(md);
    return buildMeta(md);
  } catch (e) { return null; }
}

// mode: embed (küçük gömülü sayfa) | dk (küçük JSON isteği) | page-m (tam sayfa, mobil) | page-d (tam sayfa, masaüstü)
function fetchMetaOne(item, mode) {
  var id = String(item.id), tag = 'V' + mode.charAt(mode.length - 1) + id.slice(-4);
  if (mode === 'dk') {
    return getRaw(AYAR.SITE + '/dk', pageHeaders({ 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json,*/*' }), tag,
      { method: 'POST', body: 'cmd=videoPlayerMetadata&mid=' + id }).then(function (r) {
      var m = metaFromJson(r.text);
      if (!m) dbg.push(tag + ' kaynak yok: st=' + r.status + ' len=' + (r.text || '').length);
      return m;
    });
  }
  var url = AYAR.SITE + (mode === 'embed' ? '/videoembed/' : '/video/') + id;
  var h = mode === 'page-d' ? pageHeaders({ 'User-Agent': UA_MASAUSTU }) : pageHeaders();
  return getRaw(url, h, tag).then(function (r) {
    var m = metaFromHtml(r.text);
    if (!m) dbg.push(tag + ' kaynak yok: st=' + r.status + ' url=' + String(r.url || '').replace(/^https?:\/\/[^\/]+/, '').slice(0, 40) + ' fv=' + ((r.text || '').indexOf('flashvars') > -1 ? 1 : 0));
    return m;
  });
}

// Yöntemleri sırayla, yavaşsa aralıklı paralel dener; ilk başarılı sonucu döndürür
function hedgeMeta(item, modes, gap) {
  return new Promise(function (resolve) {
    var done = false, started = 0, finished = 0, timers = [];
    function fin(m) { if (done) return; done = true; timers.forEach(clearTimeout); resolve(m); }
    function next() {
      if (done || started >= modes.length) return;
      var md = modes[started++];
      fetchMetaOne(item, md).then(function (m) { return m; }, function () { return null; }).then(function (m) {
        finished++;
        if (m) fin(m);
        else if (finished >= modes.length) fin(null);
        else next();
      });
    }
    next();
    for (var i = 1; i < modes.length; i++) timers.push(setTimeout(next, gap * i));
  });
}

function fetchMeta(item, masaustu) {
  return hedgeMeta(item, masaustu ? ['page-d', 'embed', 'page-m'] : ['embed', 'page-m', 'page-d'], 1800);
}

function heightOf(key) {
  var m = String(key || '').match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function fmtDur(sec) {
  if (!sec) return '';
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return (h ? h + ':' + p(m) : m) + ':' + p(s);
}

function makeStreams(item, ranked, meta) {
  var vids = (meta.videos || []).map(function (v) {
    var u = decodeHtml(String(v.url || '')).replace(/\\\//g, '/');
    if (u.indexOf('//') === 0) u = 'https:' + u;
    return { url: u, key: v.key || '', h: heightOf(v.key) };
  }).filter(function (v) { return /^https?:\/\//.test(v.url); });
  vids.sort(function (a, b) { return b.h - a.h; });

  var parts = ['ok.ru', ranked.lang];
  if (ranked.info.part) parts.push('Part ' + ranked.info.part);
  var dur = fmtDur(item.dur);
  var headers = { 'User-Agent': ANDROID_UA, 'Referer': AYAR.SITE + '/', 'Origin': AYAR.SITE };

  if (!vids.length) {
    if (!meta.hls) return [];
    var hl = parts.concat(['HLS']);
    if (dur) hl.push(dur);
    if (AYAR.DEBUG_MODU) hl.push('[' + item.title.slice(0, 60) + ']');
    return [{ name: AYAR.EKLENTI_ADI + ' ' + ranked.lang, title: hl.join(' | '), url: meta.hls, quality: 'Auto', headers: headers, provider: PROVIDER_ID }];
  }

  // videonun TÜM çözünürlükleri (en yüksekten düşüğe)
  var picks = vids;

  return picks.map(function (v) {
    var label = parts.concat([v.key || 'Auto']);
    if (dur) label.push(dur);
    if (AYAR.DEBUG_MODU) label.push('[' + item.title.slice(0, 60) + ']');
    return {
      name: AYAR.EKLENTI_ADI + ' ' + ranked.lang,
      title: label.join(' | '),
      url: v.url,
      quality: v.key || 'Auto',
      type: 'mp4',
      headers: headers,
      provider: PROVIDER_ID
    };
  });
}

// ============================================================
//  NUVIO GİRİŞ NOKTASI
// ============================================================

function debugStream(msg) {
  if (!AYAR.DEBUG_MODU) return [];
  return [msg].concat(dbg.slice(0, 70)).map(function (r) {
    return { name: 'DEBUG ' + r, title: 'DEBUG ' + r, url: 'https://debug.invalid/', quality: 'Auto', provider: PROVIDER_ID };
  });
}

function dotted(s) { return String(s || '').replace(/[:\-–—!?,.'"’&]+/g, ' ').trim().replace(/\s+/g, '.'); }

// Film adının yanına eklenen etiketler (öncelik sırasıyla). Sitede elle yazdığın gibi: "Kelebek Etkisi 2 tr izle"
// Arama kelimelerin HEPSİNİ içeren başlıkları getirir; bu yüzden her etiket ayrı sorgu olur.
var ETIKET_ILK = ['TR', 'Türkçe Dublaj', 'izle', 'tr izle', 'Türkçe Dublaj izle'];
var ETIKET_SONRA = ['dublaj', 'TR Dual', 'HD Türkçe', 'turkce', '1080p', '720p', 'BluRay', 'BRRip', 'DVDRip', 'tek',
  'türkce dublaj izle', 'izle türkce dublaj', 'izle Türkçe Dublaj', 'Türkçe Dublaj tek parça izle',
  'türkce dublaj tek parca izle', 'tek parça izle', 'tek parca izle', 'türkce dublaj', 'turkce dublaj',
  'bölüm izle', '1080p izle', '720p izle', '480p izle', '1080pizle', '720pizle', '480pizle', 'tr dublaj izle',
  'izle.mp4', 'izle.avi', 'izle.mpv', 'TR dub', 'dual tr', 'TR-TEK', 'HD',
  'dublajli', 'tr dublajli', 'turkce dub', 'Türkçe Dub', 'TRDUB', 'TR 1080p', 'TR 720p', 'TR BluRay', 'Türkçe', 'full izle', 'tek parça'];

// Sorgular (öncelik sırasıyla; MAX_SORGU kadarı kullanılır)
function headOf(s) {                       // "Terminatör 2: Mahşer Günü" -> "Terminatör 2"
  var h = String(s || '').split(/\s*:\s*|\s+[-–—]\s+/)[0].trim();
  return h;
}
function firstWordOf(s) {                  // ilk anlamlı (5+ harf) kelime: "Terminatör"
  var w = sigTokens(plain(s)).words.filter(function (x) { return x.length >= 5; })[0];
  return w || '';
}
function titleCase(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }
function wordsOf(s) { return plain(s).replace(/[^A-Za-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean); }
// "Yapay Zeka" -> "YapayZeka" (yükleyenler kelimeleri bitişik yazar)
function glueTitle(s) {
  var w = wordsOf(s);
  return w.length >= 2 ? w.map(titleCase).join('') : '';
}
// Ünlüsüz yazım: "Altıncı His" -> "AltncHs" ; keepLast: "Banka Soygunu" -> "Bnka Sygnu"
function stripVowels(s, keepLast, joinIt) {
  var w = wordsOf(s);
  if (w.length < 2) return '';
  var out = w.map(function (x) {
    if (x.length < 3 || /^\d+$/.test(x)) return x;
    var last = keepLast && /[aeiou]$/i.test(x) ? x.slice(-1) : '';
    var body = x.slice(1, x.length - last.length).replace(/[aeiou]/gi, '');
    return x.charAt(0).toUpperCase() + body.toLowerCase() + last.toLowerCase();
  });
  return out.join(joinIt ? '' : ' ');
}

// İngilizce kelime -> yükleyenlerin sık kullandığı Türkçe yazım
var SPELL = { aladdin: 'Alaaddin', tuxedo: 'Smokin', palace: 'Saray', castle: 'Kale', island: 'Ada', ghost: 'Hayalet',
  dragon: 'Ejderha', pirates: 'Korsanlar', treasure: 'Hazine', mummy: 'Mumya', genie: 'Cin', prince: 'Prens',
  princess: 'Prenses', kingdom: 'Krallık', jungle: 'Orman', planet: 'Gezegen', mission: 'Görev', secret: 'Sır' };

function buildQueries(imdb, year, titles, trTitles) {
  var qs = [], y = year ? ' ' + year : '', dy = year ? '.' + year : '';
  var tr1 = (trTitles || [])[0] || '', tr2 = (trTitles || [])[1] || '';
  var t0 = titles[0] || '', t1 = titles[1] || '', t2 = titles[2] || '';
  var main = tr1 || t0;                                  // sitede elle aradığın ad (Türkçe varsa o)
  var names = uniq([tr1, t0].filter(Boolean));
  function add(q) { if (q) qs.push(q); }
  add(imdb);
  add(main);                                             // sadece ad: sitede "Kelebek etkisi" yazınca çıkanların hepsi
  add(main && main + y);
  add(t0 && t0 + y);
  // Yabancı baş + yıl: sitede "Terminator 2 Kıyamet Günü" gibi karışık yazılanları da getirir
  var h0 = headOf(t0), hm = headOf(main), f0 = firstWordOf(t0), fm = firstWordOf(main);
  add(h0 && h0 !== t0 && h0 + y);
  add(hm && hm !== main && plain(hm) + y);
  add(f0 && f0 !== h0 && f0 + y);
  add(fm && fm !== f0 && fm + y);
  add(h0 && h0 !== t0 && h0 + ' TR');
  ETIKET_ILK.forEach(function (tag) { names.forEach(function (n) { add(n + ' ' + tag); }); });
  // Yükleyenlerin yazım biçimleri: bitişik (YapayZeka), ünlüsüz (AltncHs / Bnka Sygnu), yükleyen işareti (tt.57556 ...)
  var noApos = main.replace(/['’`]/g, ' ').replace(/\s+/g, ' ').trim();                    // "Alaaddin'in Sarayı" -> "Alaaddin in Sarayı"
  var noSuffix = main.replace(/['’`][a-zçğıöşü]{1,4}(?=\s|$)/gi, '').replace(/\s+/g, ' ').trim();   // -> "Alaaddin Sarayı"
  if (noApos !== main) { add(noApos + y); add(noApos); }
  if (noSuffix !== main && noSuffix !== noApos) { add(noSuffix + y); add(noSuffix); }
  var gl = glueTitle(main), gl0 = glueTitle(t0);
  add(gl);
  add(gl && gl + y);
  add(gl0 && gl0 !== gl && gl0);
  add(stripVowels(main, false, true));
  add(stripVowels(main, true, false));
  (AYAR.ONEKLER || []).forEach(function (o) { add(o + ' ' + main); });
  // Ad hiç tutmasa bile yıl + Türkçe etiketle gelenler süreyle elenir (Aladdin ~ Alaaddin gibi farklı yazımlar)
  if (year) ['tr', 'TR dublaj', 'Türkçe Dublaj', 'izle'].forEach(function (t) { add(year + ' ' + t); });
  sigTokens(plain(t0)).words.filter(function (w) { return w.length >= 5 && SPELL[w]; }).slice(0, 2)
    .forEach(function (w) { add(SPELL[w] + y); });
  add(imdb && t0 && imdb + '.' + dotted(t0) + dy);
  add(t0 && dotted(t0) + dy);
  add(tr1 && plain(tr1) !== tr1 && plain(tr1) + y);      // "Zor Olum 1988"
  add(tr1 && dotted(plain(tr1)) + dy);                   // "Zor.Olum.1988"
  add(tr2 && tr2 + y);
  add(tr2 && plain(tr2) !== tr2 && plain(tr2) + y);
  add(t1 && t1 + y);
  ETIKET_SONRA.forEach(function (tag) { add(main + ' ' + tag); });
  if (tr1 && plain(tr1) !== tr1) { add(plain(tr1)); add(plain(tr1) + ' TR'); add(plain(tr1) + ' izle'); }
  (trTitles || []).slice(2, 5).forEach(function (n) { add(n + y); });
  add(t0 && t0 + ' izle');
  add(t2 && t2 + y);
  add(t0);
  return uniq(qs.map(function (q) { return String(q || '').replace(/\s+/g, ' ').trim(); }).filter(function (q) { return q.length >= 3; }))
    .slice(0, AYAR.MAX_SORGU);
}


// ---------------- GARANTİ (kesin) akış ----------------
// tmdb + id verilen filmler: TMDB'yi, aramayı, puanlamayı BEKLEMEDEN doğrudan video sayfasından çekilir.
// Hızlı hata/yavaş yanıt için 3 deneme (2.5 sn arayla, biri masaüstü UA ile), son başarılı sonuç da önbellekte tutulur.
var GARANTI_ONBELLEK = {};

function garantiGirdileri(tmdbId, mediaType) {
  if (mediaType !== 'movie') return [];
  return (AYAR.MANUEL || []).filter(function (e) {
    return e && e.id && e.tmdb && String(e.tmdb) === String(tmdbId);
  });
}

function garantiMeta(id) {
  id = String(id);
  var c = GARANTI_ONBELLEK[id];
  if (c && Date.now() - c.t < 10 * 60 * 1000) return Promise.resolve(c.meta);   // 10 dk içindeki taze sonuç
  var kesin = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 10000); });
  return Promise.race([hedgeMeta({ id: id }, ['embed', 'dk', 'page-d', 'page-m'], 2000), kesin]).then(function (m) {
    if (m) GARANTI_ONBELLEK[id] = { t: Date.now(), meta: m };
    return m || (c ? c.meta : null);   // hepsi başarısızsa son bilinen sonuç
  });
}

function garantiAkislar(girdiler) {
  return new Promise(function (resolve) {
    var res = girdiler.map(function () { return []; }), bitenler = 0, kapandi = false, t = null;
    function kapat() {
      if (kapandi) return; kapandi = true; clearTimeout(t);
      var dolu = res.filter(function (l) { return l.length; }).length, k = 0;
      res.forEach(function (l) {                                   // birden çok dosya çıktıysa ayırt etmek için numarala
        if (!l.length) return;
        k++;
        if (dolu > 1) l.forEach(function (s) { s.name = String(s.name).replace(/ TR$/, ' TR #' + k); s.title = String(s.title).replace('| TR |', '| TR #' + k + ' |'); });
      });
      resolve(res.reduce(function (a, l) { return a.concat(l); }, []));
    }
    if (!girdiler.length) return kapat();
    girdiler.forEach(function (e, gi) {
      garantiMeta(e.id).then(function (meta) {
        if (!meta) { dbg.push('garanti meta yok ' + e.id); return []; }
        return makeStreams({ id: String(e.id), title: e.dosya, dur: 0 }, { lang: 'TR', info: {} }, meta);
      }, function () { return []; }).then(function (l) {
        res[gi] = l || [];
        bitenler++;
        if (bitenler >= girdiler.length) kapat();
        else if (l && l.length && !t) t = setTimeout(kapat, 2000);   // biri hazır: ötekiler için en fazla 2 sn daha bekle
      });
    });
  });
}

function getStreamsInner(tmdbId, mediaType, season, episode) {
  if (mediaType !== 'movie') return Promise.resolve([]);
  var gIds = garantiGirdileri(tmdbId, mediaType).map(function (e) { return String(e.id); });   // garanti yolu zaten bunları çekiyor
  dbg = ['okru v1.0.8'];
  var T0 = Date.now();
  var base = 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY;

  return Promise.all([
    getJson(base + '&language=tr-TR&append_to_response=alternative_titles,translations'),
    getJson(base + '&language=en-US').catch(function () { return {}; })
  ]).then(function (both) {
    var info = both[0], en = both[1] || {};
    var year = parseInt((info.release_date || '').slice(0, 4), 10) || 0;
    if (!info.title && !info.original_title) return debugStream('TMDB bilgisi eksik');

    var alts = [], trAlts = [];
    try {
      ((info.alternative_titles && info.alternative_titles.titles) || []).forEach(function (a) {
        if (a && a.title && /^(TR|US|GB)$/.test(a.iso_3166_1 || '')) alts.push(a.title);
        if (a && a.title && a.iso_3166_1 === 'TR') trAlts.push(a.title);
      });
    } catch (e) {}
    try {
      ((info.translations && info.translations.translations) || []).forEach(function (t) {
        if (t && t.iso_639_1 === 'tr' && t.data && t.data.title) { alts.push(t.data.title); trAlts.push(t.data.title); }
      });
    } catch (e) {}
    var titles = uniq([info.original_title, en.title, info.title]);
    var aliasTr = aliasNames([info.original_title, en.title, info.title]);   // bilinen Türkçe adlar (Zor Ölüm, Mumya...)
    var wants = uniq(titles.concat(aliasTr).concat(alts.slice(0, 8)));
    var nonTr = [norm(info.original_title), norm(en.title)];
    var trWants = uniq(aliasTr.concat([info.title]).concat(trAlts)).filter(function (t) { return t && nonTr.indexOf(norm(t)) === -1; });
    var ctx = { imdb: info.imdb_id || '', year: year, runtime: info.runtime || en.runtime || 0, wants: wants, trWants: trWants, trFilm: info.original_language === 'tr' };
    dbg.push('film ' + (info.original_title || info.title) + ' ' + year + ' ' + (ctx.imdb || '-') + ' ' + ctx.runtime + 'dk');

    var queries = buildQueries(ctx.imdb, year, titles, trWants);
    ctx.manuel = [];
    ctx.engel = [];
    (AYAR.ENGEL || []).forEach(function (e) {
      if (!e || !e.dosya || (e.yil && year && e.yil !== year)) return;
      if ((e.adlar || []).some(function (a) { return wants.some(function (w) { return norm(w) === norm(a); }); })) ctx.engel.push(norm(e.dosya));
    });
    if (ctx.engel.length) dbg.push('engel ' + ctx.engel.length);
    var manuelQs = [], direkt = [];
    (AYAR.MANUEL || []).forEach(function (e) {
      if (!e || !e.dosya || (e.yil && year && e.yil !== year)) return;
      var hit = (e.adlar || []).some(function (a) { return wants.some(function (w) { return norm(w) === norm(a); }); });
      if (!hit) return;
      if (e.id && gIds.indexOf(String(e.id)) > -1) return;                 // garanti yolu çekiyor, burada tekrar yok
      ctx.manuel.push(norm(e.dosya));
      if (e.id) { direkt.push({ id: String(e.id), title: e.dosya }); return; }   // numarası belli: arama yapmadan doğrudan ekle
      manuelQs.push(e.dosya);
      manuelQs.push(e.dosya.replace(/['’`]/g, ' '));
      manuelQs.push(e.dosya.replace(/^tt+\.?\d+\.?/i, ''));
    });
    if (manuelQs.length) { queries = uniq(manuelQs.concat(queries)); dbg.push('garanti ' + ctx.manuel.length); }
    var sinks = queries.map(function () { return []; });
    var mainQ = (trWants[0] || titles[0] || '').replace(/\s+/g, ' ').trim();
    var jobs = queries.map(function (q, i) {
      var pages = (q === mainQ || /^\d{4} /.test(q)) ? 2 : (i < 4 ? AYAR.MAX_SAYFA : 0);   // sadece-ad sorgusu en çok sayfa okur
      return searchOnce(q, i + 1, pages, sinks[i]);
    });
    (AYAR.HESAPLAR || []).forEach(function (u, hi) {                       // yükleyen hesabın tüm listesi
      var hs = [];
      sinks.push(hs);
      jobs.push(getRaw(u, null, 'H' + hi).then(function (r) {
        var items = r.ok ? parseProfile(r.text) : [];
        if (r.ok) parseSearch(r.text).forEach(function (it) { it.guvenilir = true; items.push(it); });
        hs.push.apply(hs, items);
        return items.length ? morePages(r.text, items, AYAR.HESAP_SAYFA, 'H' + hi, hs) : items;
      }));
    });
    return waitSome(jobs, Math.min(jobs.length, 14), AYAR.ARAMA_SURESI).then(function () {
      var seen = {}, all = [];
      sinks.forEach(function (l) {
        l.forEach(function (it) { if (!seen[it.path]) { seen[it.path] = true; all.push(it); } });
      });
      direkt.forEach(function (d) {                                      // garanti listesindeki doğrudan videolar (en başa)
        var pth = '/video/' + d.id;
        if (seen[pth]) { all.forEach(function (it) { if (it.path === pth) it.title = d.title; }); return; }
        seen[pth] = true;
        all.unshift({ path: pth, id: d.id, durText: '', dur: 0, title: d.title });
      });
      katalogItems().forEach(function (k) { if (!seen[k.path]) { seen[k.path] = true; all.push(k); } });   // hesap kataloğu her zaman aday
      if (gIds.length) all = all.filter(function (it) { return gIds.indexOf(String(it.id)) === -1; });   // aynı videoyu iki kez çekme
      dbg.push('sonuc ' + all.length + ' ' + (Date.now() - T0) + 'ms');
      if (AYAR.DEBUG_MODU) {
        dbg.push('sorgu sayilari ' + sinks.slice(0, queries.length).map(function (l) { return l.length; }).join(','));
        queries.slice(0, 10).forEach(function (q, i) { dbg.push('q' + (i + 1) + ' [' + sinks[i].length + '] ' + q); });
      }

      var ranked = [], rejected = 0, ranked0 = null;
      function rankAll() {
        ranked = []; rejected = 0;
        all.forEach(function (it) {
          var r = rankItem(it, ctx);
          if (r && it.guvenilir) { r.maybe = false; r.lang = 'TR'; r.tier = Math.min(r.tier, 1); }   // bu hesabın yüklemeleri Türkçe kabul
          if (r) ranked.push({ item: it, r: r });
          else {
            rejected++;
            if (AYAR.DEBUG_MODU && (rejected <= 4 || fuzzyHit(analyze(it.title), ctx.wants)) && dbg.length < 70) dbg.push('red ' + it.title.slice(0, 38) + ' ' + fmtDur(it.dur));
          }
        });
        ranked.sort(function (a, b) { return (a.r.tier - b.r.tier) || (b.r.score - a.r.score); });
      }
      rankAll();
      dbg.push('aday ' + ranked.length);

      // Arama dosyayı getirmediyse: yükleyen hesabın kendi video listesini tara (garanti listesi ya da hiç aday yoksa)
      var needScan = !ranked.length || (ctx.manuel.length && !ranked.some(function (x) { return x.r.score === 999; }));
      var accs = needScan ? uniq((AYAR.HESAPLAR || []).concat(accountsOf(all).map(function (a) { return AYAR.MOBILE + a; }))) : [];
      var scanP = accs.length ? waitWithin(accs.map(function (u, ai) {
        var hs = [];
        return scanList(u, AYAR.HESAP_SAYFA, hs, ai).then(function () {
          var add = 0;
          hs.forEach(function (it) { if (!seen[it.path]) { seen[it.path] = true; all.push(it); add++; } });
          dbg.push('hesap ' + u.replace(/^https?:\/\/[^\/]+/, '') + ' +' + add);
        });
      }), 3800) : Promise.resolve();
      return scanP.then(function () {
        if (accs.length) { rankAll(); dbg.push('hesap sonrasi aday ' + ranked.length); }
      if (!ranked.length) return debugStream('uygun video yok: ' + (info.title || info.original_title) + ' ' + year);

      // kesin Türkçe adaylar + (etiketsiz / sadece Dual) birkaç belirsiz aday: bunların ses parçası kontrol edilir
      var sure = ranked.filter(function (x) { return !x.r.maybe; }).slice(0, AYAR.MAX_ADAY);
      var unsure = ranked.filter(function (x) { return x.r.maybe; }).slice(0, AYAR.MAX_BELIRSIZ);
      var top = sure.concat(unsure);
      var metas = top.map(function () { return null; });
      var metaJobs = top.map(function (x, i) {
        return fetchMeta(x.item).then(function (m) { metas[i] = m; }, function () {});
      });
      var tMeta = Date.now();
      return waitWithin(metaJobs.slice(0, sure.length), AYAR.KAYNAK_SURESI)
        .then(function () {
          var kalan = Math.max(700, AYAR.KAYNAK_SURESI - (Date.now() - tMeta));   // belirsizlere de tam süre
          return waitWithin(metaJobs.slice(sure.length), kalan);
        }).then(function () {
        var streams = [], seenUrl = {};
        top.forEach(function (x, i) {
          if (!metas[i]) { dbg.push('meta yok ' + x.item.path); return; }
          if (x.r.maybe) {
            if (metaTurkishAudio(metas[i])) x.r.lang = 'TR Ses';
            else if (AYAR.BELIRSIZ_GOSTER) { x.r.lang = 'Dil ?'; x.r.tier = 3; }
            else { dbg.push('dil belirsiz ' + x.item.title.slice(0, 30)); return; }
          }
          makeStreams(x.item, x.r, metas[i]).forEach(function (s) {
            if (!seenUrl[s.url]) { seenUrl[s.url] = true; streams.push(s); }
          });
        });
        dbg.push('bitti ' + (Date.now() - T0) + 'ms');
        if (!streams.length) return debugStream('kaynak cikmadi');
        return AYAR.DEBUG_MODU ? streams.concat(debugStream('akis bulundu: ' + streams.length)) : streams;   // debug açıkken satırlar akışların altında da görünür
      });
      });
    });
  }).catch(function (e) { return debugStream('hata ' + (e && e.message)); });
}

// Garanti akışlar normal aramadan BAĞIMSIZ çalışır; hazır olunca arama için en fazla 2,5 sn daha beklenir.
function getStreams(tmdbId, mediaType, season, episode) {
  var gl = garantiGirdileri(tmdbId, mediaType);
  var gp = (gl.length ? garantiAkislar(gl) : Promise.resolve([])).catch(function () { return []; });
  function birlestir(g, d) {
    var out = [], seen = {};
    g.concat(d || []).forEach(function (s) {
      if (!s || (s.url !== 'https://debug.invalid/' && seen[s.url])) return;
      seen[s.url] = true; out.push(s);
    });
    return out;
  }
  return new Promise(function (resolve) {
    var done = false, g = [], inner = null, grace = null;
    var tmr = setTimeout(function () { finish('zaman asimi'); }, AYAR.GENEL_SURE);
    function finish(why) {
      if (done) return;
      done = true; clearTimeout(tmr); clearTimeout(grace);
      var extra = inner || (AYAR.DEBUG_MODU ? debugStream(why + ' garanti=' + g.length) : []);
      resolve(birlestir(g, AYAR.DEBUG_MODU ? extra.concat([{ name: 'DEBUG garanti akis: ' + g.length, title: 'DEBUG garanti akis: ' + g.length, url: 'https://debug.invalid/', quality: 'Auto', provider: PROVIDER_ID }]) : extra));
    }
    gp.then(function (gg) {
      g = gg;
      if (gg.length && !done) grace = setTimeout(function () { finish('arama beklenmedi'); }, 2500);
      else if (innerReady) finish('bitti');
    });
    var innerReady = false;
    getStreamsInner(tmdbId, mediaType, season, episode).then(function (r) { return r; }, function () { return []; }).then(function (r) {
      inner = r; innerReady = true;
      gp.then(function () { finish('bitti'); });
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams, _t: { parseProfile: parseProfile, katalogItems: katalogItems, sameTitle: sameTitle, wildEq: wildEq, accountsOf: accountsOf, exactTitle: exactTitle, splitTok: splitTok, glueTitle: glueTitle, stripVowels: stripVowels, tokEq: tokEq, skelMatch: skelMatch, metaTurkishAudio: metaTurkishAudio, aliasNames: aliasNames, langInfo: langInfo, partialName: partialName, parseSearch: parseSearch, analyze: analyze, rankItem: rankItem, nameMatch: nameMatch, sigTokens: sigTokens, looseEq: looseEq, buildQueries: buildQueries, ETIKET_ILK: ETIKET_ILK, TR_ALIAS: TR_ALIAS } };
} else {
  global.getStreams = getStreams;
}
