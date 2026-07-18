# Upute za korištenje aplikacije Visitors

Visitors je jednostavna aplikacija za male iznajmljivače i paušalne obrte u Hrvatskoj. Pomaže vam izdati i fiskalizirati račune, voditi evidenciju i — što je najvažnije — čuva vas od poreznih pogrešaka i propuštenih rokova.

Ove upute vode vas korak po korak, od prvog dana do svakodnevnog rada.

---

## 👋 Što aplikacija radi za vas

- Izdaje i **fiskalizira račune** (JIR, ZKI i QR kod) prema hrvatskim propisima.
- **Automatski numerira** račune bez rupa i duplikata.
- Vodi **knjigu prometa** umjesto vas.
- Prati vaše **porezne obveze** i rokove te vas na vrijeme upozori.
- Na račun po želji ispisuje i **podatke tvrtke gosta** — za poslovne goste koji trebaju račun za firmu.
- Radi na mobitelu, tabletu i računalu — jednako lako.

> 💡 **Savjet:** Aplikaciju možete instalirati na početni zaslon telefona (kao pravu aplikaciju). U pregledniku odaberite „Dodaj na početni zaslon".

---

## 🚀 Prvi koraci

Prije prvog računa potrebno je ispuniti par podataka. Aplikacija vas kroz to vodi, a **izdavanje računa je zaključano dok profil nije potpun** — tako vas štitimo od računa s greškom.

1. **Registracija** — unesite ime, naziv djelatnosti, email i lozinku te odaberite jeste li **privatni iznajmljivač** ili **paušalni obrt** i jeste li u sustavu PDV-a.
2. **Podaci obrta** (Postavke → Obrt) — unesite **OIB** (provjeravamo ga automatski), adresu i mjesto poslovanja. Upišite i **IBAN (za uplate)** — ispisuje se na računu, a potreban je i za **barkod za plaćanje** (vidi Izdavanje računa).
3. **Poslovni prostor i naplatni uređaj** (Postavke → Prostori) — dodajte barem jedan prostor (npr. oznaka `POSL1`) i jedan naplatni uređaj. Iz njih se slaže broj računa, npr. `1/POSL1/1`.
4. **Usluge** (Postavke → Usluge) — spremite usluge koje najčešće naplaćujete (npr. „Noćenje"). Time ubrzavate unos računa.

> ✅ Kad je sve popunjeno, na početnom ekranu semafor postaje zelen i spremni ste za izdavanje računa.

> 🔐 **Prije prvog pravog računa** dodajte i **digitalni certifikat** (Postavke → Fiskalizacija) — bez njega se računi vode uredno, ali se ne šalju Poreznoj upravi. Vidi poglavlje **Fiskalizacija, JIR i ZKI**.

> 💡 **Neobavezno:** Ako vam dolaze poslovni gosti koji traže podatke svoje firme na računu, te firme možete unaprijed spremiti u **Postavke → Tvrtke**. Nije uvjet za izdavanje računa i možete ih dodati kad zatrebaju.

---

## 🧾 Izdavanje računa

1. Pritisnite **Novi račun** (veliki `+` gumb na dnu ili gumb u zaglavlju).
2. Odaberite **prostor**, **naplatni uređaj** i po želji **gosta**.
3. Ako gost traži da se na računu vide i podaci njegove firme, odaberite je u polju **Tvrtka** (ili je dodajte na licu mjesta gumbom **＋ Nova**). Polje je neobavezno — više u poglavlju **Tvrtke gostiju**.
4. Dodajte **stavke** — klikom na spremljenu uslugu ili ručno (opis, količina, cijena).
5. Odaberite **način plaćanja** (gotovina, kartica, transakcijski račun).
6. Pritisnite **Pregledaj i izdaj** te potvrdite.

Nakon potvrde račun se **automatski fiskalizira** i dobiva **JIR** i **ZKI** te **QR kod** za provjeru. Račun možete **preuzeti kao PDF**.

> ⚠️ **Važno:** Izdani račun se više ne može mijenjati. Ispravak je moguć isključivo **storniranjem** — tako nalaže zakon.

### 💳 Barkod za plaćanje (HUB-3)

Kad je način plaćanja **transakcijski račun**, PDF računa automatski dobiva i **HUB-3 2D barkod** — isti standard koji koriste hrvatske uplatnice. Gost ga skenira u aplikaciji svoje banke i nalog za plaćanje se **sam popuni**: vaš IBAN, iznos i opis s brojem računa. Bez prepisivanja i bez grešaka u uplati.

Jedini uvjet: u **Postavke → Obrt** mora biti upisan vaš **IBAN**. Na računima plaćenim gotovinom ili karticom i na storno računima barkoda nema — tamo nema što platiti.

> 💡 Ako su oznake prostora i naplatnog uređaja čisto brojčane (pa broj računa izgleda kao `7/1/1`), barkod nosi i **poziv na broj** izveden iz broja računa, pa uplatu lakše povežete s računom. S oznakama koje sadrže slova (npr. `POSL1`) uplata prolazi jednako — račun prepoznajete iz opisa plaćanja.

---

## 🔐 Fiskalizacija, JIR i ZKI

Na svakom izdanom računu piše dvoje, i to nije isto:

| | Što je | Tko ga radi |
|---|---|---|
| **ZKI** — zaštitni kod izdavatelja | 32 znaka koje aplikacija izračuna iz podataka vašeg računa i vašeg certifikata | **Vi.** Postoji uvijek, i kad Porezna nije dostupna. |
| **JIR** — jedinstveni identifikator računa | Potvrda da je Porezna uprava račun zaprimila | **Porezna uprava.** Dobiva se tek kad poruka prođe. |

Zato račun **uvijek ima ZKI**, a JIR ponekad stigne kasnije. To je zakonom predviđeno i nije greška.

### Ako fiskalizacija ne prođe

Račun **ostaje valjan i uredno evidentiran** — možete ga izdati gostu. Aplikacija razlikuje dva slučaja:

- 🟡 **„Na čekanju"** — Porezna trenutno nije dostupna (npr. nema interneta). **Ne morate ništa raditi.** Aplikacija sama pokušava ponovno, u sve rjeđim razmacima, sve do isteka zakonskog roka za naknadnu dostavu. Čim veza proradi, račun sam dobije JIR. Ako vam se žuri, na detalju računa postoji i gumb **Naknadna fiskalizacija**.
- 🔴 **„Greška fiskalizacije"** — Porezna je poruku **odbila** (npr. neispravan ili istekao certifikat). Ponovno slanje istog računa neće pomoći dok se uzrok ne ispravi. Poruku greške vidite na detalju računa.

> 🔔 U oba slučaja kad problem **ostane neriješen** — Porezna je račun odbila ili je istekao rok za naknadnu dostavu — dobit ćete **obavijest u zvonu** s linkom na taj račun. Račun ne može tiho propasti.

### Provjera računa QR kodom

Gost može mobitelom skenirati **QR kod** s računa i na stranici Porezne uprave provjeriti je li račun stvarno prijavljen. Na **storno računu** QR nosi negativan iznos — tako i mora biti, jer storno umanjuje promet.

### Digitalni certifikat (Postavke → Fiskalizacija)

Za slanje pravih računa Poreznoj upravi potreban je **digitalni certifikat** (FINA ili drugi ovlašteni izdavatelj) koji sadrži vaš OIB. Postavlja se **jednom**:

1. Otvorite **Postavke → Fiskalizacija**.
2. Odaberite datoteku certifikata (**.p12**) i upišite njezinu **lozinku**.
3. Odaberite **okolinu** — dok testirate ostavite **Testna okolina**, na **Produkciju** prijeđite tek kad je sve provjereno.
4. Pritisnite **Spremi certifikat**.

Aplikacija odmah pročita certifikat i pokaže **OIB na koji glasi** i **do kada vrijedi**. Certifikat mora glasiti na **isti OIB kao vaš obrt** — ako ne glasi, aplikacija ga **odbija odmah**, jer bi Porezna inače odbijala svaki vaš račun. Certifikat se čuva **šifrirano** i nikad se ne prikazuje natrag.

> ⏰ **Pratite rok valjanosti.** Kad se približi istek, na istom ekranu piše „Vrijedi do". Istekao certifikat = računi se prestaju fiskalizirati. Novi postavljate gumbom **Zamijeni certifikat**.

Na istom ekranu, pod **Postavke fiskalnog računa**, još su dvije stavke:

- **Slijednost brojeva računa** — mora odgovarati onome što ste prijavili Poreznoj upravi (najčešće **po naplatnom uređaju**).
- **OIB operatera** — OIB osobe koja izdaje račun. **Ostavite prazno ako račune izdajete sami** — tada se koristi OIB vašeg obrta. Popunite samo ako račune u vaše ime izdaje netko drugi.

> 💡 Dok certifikat nije postavljen, aplikacija radi u **testnom načinu**: računi se numeriraju i vode uredno, ali se ne šalju Poreznoj upravi.

---

## ↩️ Storno računa

Otvorite račun i pritisnite **Storniraj**, upišite razlog i potvrdite. Aplikacija izradi **storno dokument** koji poništava izvorni račun; izvorni račun ostaje trajno zabilježen (kako i mora).

---

## 👥 Gosti

U izborniku **Gosti** vodite evidenciju gostiju (ime, država, dokument, kontakt). Spremljenog gosta možete brzo odabrati pri izradi računa.

Za **prijavu u eVisitor** gost treba i dodatne podatke — datum rođenja, spol, državljanstvo, državu i grad prebivališta te šifru dokumenta. Njih unosite u istom obrascu, u dijelu **„Podaci za eVisitor"**. Bez njih se gost može staviti na račun, ali se ne može prijaviti.

---

## 🏢 Tvrtke gostiju

Gosti su često poslovni putnici i traže da im na računu, uz njihovo ime, budu ispisani i podaci **njihove firme** — jer im to treba za priznavanje troška. Za to služe **Tvrtke**.

### Kako to izgleda na računu

Na PDF-u računa, **desno od bloka KUPAC**, pojavi se blok **PODACI O TVRTKI** s nazivom, adresom i OIB-om (odnosno PDV ID-om za strane firme). Kupac na računu **ostaje gost** — podaci tvrtke su informativni dodatak. Numeriranje, fiskalizacija i PDV se ne mijenjaju ni na koji način.

> 💡 Ako na računu ne odaberete tvrtku, račun izgleda točno kao i dosad — ništa se ne dodaje.

### Dodavanje tvrtke

Tvrtku možete unijeti na dva mjesta, obrazac je isti:

- **Postavke → Tvrtke** — popis svih spremljenih tvrtki, s tražilicom po nazivu, OIB-u ili PDV ID-u.
- **Na samom računu** — gumb **＋ Nova** pored polja Tvrtka. Nakon spremanja tvrtka se odmah odabere na tom računu.

Unosite: **naziv** (obavezno), OIB, PDV ID, adresu, poštanski broj, mjesto, državu, e-mail, telefon i napomenu.

- **OIB** provjeravamo automatski (11 znamenki + kontrolna znamenka), pa tipfeler ne može završiti na računu.
- **Strane tvrtke** — OIB ostavite prazan i upišite **PDV ID** (npr. `DE811569869`). Tada se na računu ispisuje i država.
- **E-mail, telefon i napomena** se **ne ispisuju** na računu — služe samo vama.

> ✅ Tvrtka se sprema jednom. Sljedeći put je samo odaberete iz liste — bez ponovnog upisivanja. Istu tvrtku možete staviti na račune različitih gostiju (npr. dvoje kolega iz iste firme).

### Ispravak i arhiviranje

Tvrtku uredite ili arhivirate u **Postavke → Tvrtke**.

> ⚠️ **Važno:** Izmjena ili arhiviranje tvrtke **ne dira već izdane račune**. Svaki račun trajno čuva podatke onakve kakvi su bili u trenutku izdavanja — kao i sve ostalo na izdanom računu. Ako ste pogriješili OIB na već izdanom računu, ispravak je moguć samo **storniranjem** i izdavanjem novog računa.

> 💡 **Napomena za knjigovodstvo:** OIB tvrtke na računu vaš knjigovođa u praksi može tretirati kao **R1 račun**. Ako niste sigurni što gost zapravo treba, provjerite s knjigovođom.

---

## 🔌 eVisitor — spajanje aplikacije

Da biste goste prijavljivali izravno iz aplikacije, jednom je treba spojiti na eVisitor. Postupak ima tri koraka i radi se **samo prvi put**.

### 1. Pristupni podaci (Postavke → eVisitor)

Pristupne podatke **otvarate sami kod svoje turističke zajednice**.

> 💡 **Preporuka HTZ-a:** za aplikaciju otvorite **poseban API podkorisnički račun**, odvojen od onoga kojim se prijavljujete na eVisitor web. Tako, ako ikad povučete pristup aplikaciji, vaš glavni račun ostaje netaknut.

Unosite četiri podatka:

| Polje | Što upisati |
|---|---|
| **Korisničko ime** | Korisničko ime API podkorisnika. |
| **Okolina** | **Testna okolina** ili **Produkcija**. Počnite s testnom. |
| **Lozinka** | Lozinka tog korisnika. |
| **API ključ** | Potreban **samo na testnoj okolini**. Ako ga nemate, ostavite prazno. |

Adresu servera ne upisujete — aplikacija je zna sama, ovisno o odabranoj okolini.

Pritisnite **Spremi**, pa **Testiraj vezu**.

- ✅ Uspjeh — pojavi se zelena linija **„Veza potvrđena"** s datumom i vremenom.
- ❌ Neuspjeh — pojavi se crveni okvir s **porukom koju je vratio eVisitor**, doslovno. Najčešće je riječ o pogrešnom korisničkom imenu, lozinci ili API ključu, ili o tome da ste podatke testnog korisnika unijeli uz odabranu **Produkciju** (i obrnuto).

> 🔒 Lozinka i API ključ spremaju se **šifrirano** i nakon spremanja se više ne prikazuju — vidjet ćete samo „Lozinka je spremljena." i gumb **Promijeni**. Podaci vrijede samo za vaš račun.

### 2. Šifrarnici

Pritisnite **Sinkroniziraj šifrarnike**. Aplikacija povuče službene šifre iz eVisitora — **države, vrste dokumenata i kategorije boravišne pristojbe** — i njima puni padajuće izbornike pri prijavi gosta.

> ⚠️ Bez ovog koraka pri prijavi gosta piše „Šifrarnik još nije sinkroniziran s eVisitorom." i nećete moći odabrati kategoriju pristojbe. Sinkronizaciju ponovite ako eVisitor objavi nove šifre.

### 3. Smještajni objekti (Postavke → Objekti)

Pritisnite **Povuci iz eVisitora** — vaši se objekti popune sami i javi se koliko ih je povučeno.

Objekt možete dodati i **ručno** (gumb **Novi objekt**): naziv, **šifra objekta u eVisitoru**, adresa i mjesto.

> ⚠️ **Šifra objekta mora točno odgovarati onoj u eVisitoru** (npr. `0000022`) — vidljiva je u eVisitoru pod *Objekti*. S krivom šifrom prijava neće proći.

Objekt se ne briše nego **deaktivira**: više se ne nudi za nove prijave, a postojeći boravci ostaju zabilježeni.

> ✅ Kad su sva tri koraka gotova, spremni ste za prijavu gostiju. Postavke ne morate više dirati.

---

## 🛏️ Boravci — prijava i odjava u eVisitor

Ekran **Boravci** zamjenjuje ručni rad u eVisitor web sučelju. Prije prve prijave spojite aplikaciju na eVisitor — vidi prethodno poglavlje.

### Prijava gosta

**Boravci → Nova prijava**: odaberite objekt i gosta, upišite dolazak i predviđeni odlazak te kategoriju boravišne pristojbe. Aplikacija provjeri podatke **prije slanja** i javi što nedostaje.

> ⚠️ **Upišite stvarno vrijeme dolaska i odlaska** — ne trenutak kad unosite podatke i ne datum računa. eVisitor iz tih vremena računa noćenja i boravišnu pristojbu: boravak nakon 18:00 broji se kao još jedno noćenje, a dolazak prije 06:00 kao prethodni dan.

### Odjava

Otvorite boravak i pritisnite **Odjavi gosta** te upišite **stvarno** vrijeme odlaska. eVisitor očekuje odjavu **u roku 24 sata**.

### Statusi boravka

| Status | Što znači |
|---|---|
| **Zaprimljeno u eVisitoru** | Sve je prošlo. Nemate više posla. |
| **Na čekanju** | Poslano, ali eVisitor još nije potvrdio. Aplikacija sama ponavlja slanje. |
| **Greška** | eVisitor je **odbio** podatke. Traži vašu intervenciju. |
| **Nije poslano** | Boravak je spremljen kod vas, ali još nije poslan. |

### Kad nešto ne prođe

- **„Na čekanju"** — eVisitor trenutno nije dostupan ili sporo odgovara. **Ne morate ništa raditi**: aplikacija sama pokušava ponovno, u sve rjeđim razmacima (od nekoliko minuta do najviše sat vremena), dok ne uspije. Možete i ručno pritisnuti **Pokušaj ponovno**.
- **„Greška"** — eVisitor je odbio podatke (npr. dupla prijava, kategorija pristojbe koja ne odgovara dobi gosta, kriva šifra objekta). Poruku eVisitora prikazujemo **doslovno** na detalju boravka, pod *Poruke sustava eVisitor*. **Ispravite podatak pa pošaljite ponovno** — samo ponavljanje slanja neće pomoći jer eVisitor nije bio nedostupan, nego je podatak odbio. Riješenu poruku označite s **Označi kao riješeno**.

> ✅ **Ponovno slanje ne može stvoriti duplu prijavu.** Svaka prijava nosi svoju oznaku koju eVisitor prepoznaje, pa i ako pritisnete „Pokušaj ponovno" nekoliko puta, gost ostaje prijavljen samo jednom.

> ✅ Prijava se **uvijek prvo spremi kod vas**, pa tek onda šalje. Ako eVisitor nije dostupan, boravak vam neće nestati.

> 🔔 Ako prijava ne prođe **unutar 24 sata**, dobit ćete obavijest („eVisitor prijava nije prošla"). Otvorite boravak i pogledajte poruku sustava — u tom roku eVisitor očekuje prijavu.

---

## 🛡️ Porezne obveze

Ekran **Porezne obveze** je vaš „porezni semafor" — na jednom mjestu vidite je li sve u redu:

- **Čuvar praga PDV-a** — prati godišnji promet u odnosu na zakonski prag i **procjenjuje kada biste ga mogli prijeći**. Prelazak znači ulazak u sustav PDV-a.
- **Status u sustavu PDV-a** — status mijenjate kroz vođeni čarobnjak s **datumom stupanja na snagu**. Računi prije tog datuma ostaju bez PDV-a, a od datuma nadalje obračunavaju PDV.
- **Porezni kalendar** — nadolazeći rokovi (paušalni porez, turistička pristojba, obrasci) s odbrojavanjem.
- **Provizije stranih platformi** — ako plaćate proviziju Bookingu ili Airbnbu, uključite tu opciju.

> ⚠️ **Česta zamka:** Za provizije stranim platformama obično trebate **PDV ID broj** i obračun 25% PDV-a na proviziju (mjesečni PDV i PDV-S obrazac). Aplikacija vas na to upozori.

> 💡 **Napomena:** Rokovi u kalendaru su **orijentacijski** i mogu se razlikovati po općini/gradu i godini. Uvijek ih potvrdite sa svojim knjigovođom.

---

## 📒 Knjiga prometa (KPR)

Knjiga prometa se **vodi sama** iz vaših izdanih računa — kronološki, s odvojenom gotovinom i bezgotovinskim plaćanjem te tekućim zbrojem. Za knjigovođu je možete **izvesti u PDF ili CSV (Excel)** i odabrati godinu.

---

## 🧮 Kalkulatori

Brzi kalkulatori procjenjuju vaše godišnje porezno opterećenje:

- **Paušalni porez po krevetu**
- **Turistička pristojba**
- **Ukupno godišnje opterećenje** (s kvartalnom ratom)

> 💡 Stope po krevetu i pristojbe razlikuju se po JLS-u (općini/gradu). Unesite vrijednosti za svoje mjesto ili ih potvrdite s knjigovođom.

---

## 📊 Analitika i izvozi

Ekran **Analitika** daje pregled poslovanja s filtrima po razdoblju, prostoru i načinu plaćanja:

- **Promet** po mjesecu, prostoru, načinu plaćanja i kategoriji.
- **Gosti** i **noćenja**.
- Prebacivanje između **grafova** i **tablice**.
- **Izvoz u Excel, CSV i PDF** — uvijek prema trenutno odabranim filtrima.

---

## 🔔 Obavijesti i svakodnevni alati

| Ikona | Što radi |
|---|---|
| 🔔 Zvono | Obavijesti i podsjetnici (rokovi, prag PDV-a, računi koje Porezna nije zaprimila, upozorenja) |
| ❓ Pomoć | Otvara ove upute |
| 🔄 Osvježi | Ponovno učitava aplikaciju |
| 🌗 Tema | Prebacuje svijetli/tamni prikaz |

Klik na logo **Visitors** vas uvijek vraća na početni ekran. Na računalu i tabletu su vaš profil i **odjava** u dnu lijevog izbornika; na mobitelu ih nađete pod **Više**.

---

## 💡 Savjeti i česta pitanja

- **Ne mogu izdati račun?** Provjerite je li profil potpun (OIB, adresa, prostor, naplatni uređaj) — semafor na početnoj pokazuje što nedostaje.
- **Račun je „na čekanju"?** Porezna trenutno nije dostupna. **Ne morate ništa raditi** — aplikacija sama ponavlja slanje dok ne prođe. Račun je valjan i možete ga dati gostu (ZKI je na njemu).
- **Piše „Greška fiskalizacije"?** To znači da je Porezna račun **odbila** i ponovno slanje neće pomoći. Najčešći uzrok je certifikat: provjerite u **Postavke → Fiskalizacija** je li istekao i glasi li na isti OIB kao obrt.
- **Kako dobiti certifikat?** Naručuje se kod FINA-e (ili drugog ovlaštenog izdavatelja) i mora glasiti na OIB vašeg obrta. Dobiveni **.p12** i njegovu lozinku unesete u **Postavke → Fiskalizacija**.
- **Pogriješio sam na računu?** Ne brišite ga — **stornirajte** ga i izdajte novi.
- **Gost traži da mu na računu pišu podaci firme?** Odaberite (ili dodajte) tvrtku u polju **Tvrtka** pri izradi računa. Podaci se ispisuju na PDF-u i pamte za sljedeći put.
- **Na PDF-u nema barkoda za plaćanje?** Barkod se ispisuje samo za način plaćanja **transakcijski račun**, i tek kad je u **Postavke → Obrt** upisan **IBAN**.
- **„Testiraj vezu" ne prolazi?** Provjerite jeste li odabrali pravu **okolinu** (testni podaci ne rade na Produkciji i obrnuto) i, na testnoj okolini, jeste li unijeli **API ključ**. Crveni okvir ispisuje poruku samog eVisitora — ona vam kaže što je odbijeno.
- **Ne mogu odabrati kategoriju boravišne pristojbe?** Niste sinkronizirali šifrarnike: **Postavke → eVisitor → Sinkroniziraj šifrarnike**.
- **Prijava stoji na „Na čekanju"?** To je normalno kad eVisitor ne odgovara. Aplikacija sama ponavlja slanje — ne morate ništa raditi.
- **Gost je iz strane firme?** OIB ostavite prazan, upišite **PDV ID**. Država se tada ispisuje na računu.
- **Ispravio sam OIB tvrtke — mijenja li se stari račun?** Ne. Već izdani računi trajno čuvaju podatke iz trenutka izdavanja. Za ispravak već izdanog računa — storno.
- **Mijenjam status PDV-a?** Koristite čarobnjak u „Porezne obveze" i upišite datum od kojeg vrijedi.

> ✅ **Zlatno pravilo:** Kad god niste sigurni oko poreza, uskladite se sa svojim knjigovođom. Aplikacija vam olakšava evidenciju i upozorava na rizike, ali ne zamjenjuje stručni savjet.

---

*Sretno s radom! Visitors je tu da vam administracija oduzme što manje vremena.*
