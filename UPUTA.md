# Upute za korištenje aplikacije Visitors

Visitors je jednostavna aplikacija za male iznajmljivače i paušalne obrte u Hrvatskoj. Pomaže vam izdati i fiskalizirati račune, voditi evidenciju i — što je najvažnije — čuva vas od poreznih pogrešaka i propuštenih rokova.

Ove upute vode vas korak po korak, od prvog dana do svakodnevnog rada.

---

## 👋 Što aplikacija radi za vas

- Izdaje i **fiskalizira račune** (JIR, ZKI i QR kod) prema hrvatskim propisima.
- **Automatski numerira** račune bez rupa i duplikata.
- Vodi **knjigu prometa** umjesto vas.
- Prati vaše **porezne obveze** i rokove te vas na vrijeme upozori.
- Radi na mobitelu, tabletu i računalu — jednako lako.

> 💡 **Savjet:** Aplikaciju možete instalirati na početni zaslon telefona (kao pravu aplikaciju). U pregledniku odaberite „Dodaj na početni zaslon".

---

## 🚀 Prvi koraci

Prije prvog računa potrebno je ispuniti par podataka. Aplikacija vas kroz to vodi, a **izdavanje računa je zaključano dok profil nije potpun** — tako vas štitimo od računa s greškom.

1. **Registracija** — unesite ime, naziv djelatnosti, email i lozinku te odaberite jeste li **privatni iznajmljivač** ili **paušalni obrt** i jeste li u sustavu PDV-a.
2. **Podaci obrta** (Postavke → Obrt) — unesite **OIB** (provjeravamo ga automatski), adresu i mjesto poslovanja.
3. **Poslovni prostor i naplatni uređaj** (Postavke → Prostori) — dodajte barem jedan prostor (npr. oznaka `POSL1`) i jedan naplatni uređaj. Iz njih se slaže broj računa, npr. `1/POSL1/1`.
4. **Usluge** (Postavke → Usluge) — spremite usluge koje najčešće naplaćujete (npr. „Noćenje"). Time ubrzavate unos računa.

> ✅ Kad je sve popunjeno, na početnom ekranu semafor postaje zelen i spremni ste za izdavanje računa.

---

## 🧾 Izdavanje računa

1. Pritisnite **Novi račun** (veliki `+` gumb na dnu ili gumb u zaglavlju).
2. Odaberite **prostor**, **naplatni uređaj** i po želji **gosta**.
3. Dodajte **stavke** — klikom na spremljenu uslugu ili ručno (opis, količina, cijena).
4. Odaberite **način plaćanja** (gotovina, kartica, transakcijski račun).
5. Pritisnite **Pregledaj i izdaj** te potvrdite.

Nakon potvrde račun se **automatski fiskalizira** i dobiva **JIR** i **ZKI** te **QR kod** za provjeru. Račun možete **preuzeti kao PDF**.

> ⚠️ **Važno:** Izdani račun se više ne može mijenjati. Ispravak je moguć isključivo **storniranjem** — tako nalaže zakon.

Ako fiskalizacija ne uspije (npr. nema veze), račun ostaje evidentiran s oznakom **„na čekanju"**. Na detalju računa pritisnite **Naknadna fiskalizacija** čim se veza uspostavi.

---

## ↩️ Storno računa

Otvorite račun i pritisnite **Storniraj**, upišite razlog i potvrdite. Aplikacija izradi **storno dokument** koji poništava izvorni račun; izvorni račun ostaje trajno zabilježen (kako i mora).

---

## 👥 Gosti

U izborniku **Gosti** vodite evidenciju gostiju (ime, država, dokument, kontakt). Spremljenog gosta možete brzo odabrati pri izradi računa.

Za **prijavu u eVisitor** gost treba i dodatne podatke — datum rođenja, spol, državljanstvo, državu i grad prebivališta te šifru dokumenta. Njih unosite u istom obrascu, u dijelu **„Podaci za eVisitor"**. Bez njih se gost može staviti na račun, ali se ne može prijaviti.

---

## 🛏️ Boravci — prijava i odjava u eVisitor

Ekran **Boravci** zamjenjuje ručni rad u eVisitor web sučelju.

### Prije prve prijave

1. **Postavke → eVisitor** — unesite pristupne podatke i pritisnite **Testiraj vezu**.
   > 💡 Pristupne podatke otvarate sami kod svoje **turističke zajednice**. Preporuka je da za aplikaciju otvorite **poseban API podkorisnički račun**, odvojen od onoga kojim se prijavljujete na eVisitor web.
2. Pritisnite **Sinkroniziraj šifrarnike** — time aplikacija povuče službene šifre (države, vrste dokumenata, kategorije pristojbe) izravno iz eVisitora.
3. **Postavke → Objekti** — pritisnite **Povuci iz eVisitora** i vaši smještajni objekti se sami popune. Možete ih dodati i ručno, ali šifra objekta mora točno odgovarati onoj u eVisitoru.

### Prijava gosta

**Boravci → Nova prijava**: odaberite objekt i gosta, upišite dolazak i predviđeni odlazak te kategoriju boravišne pristojbe. Aplikacija provjeri podatke **prije slanja** i javi što nedostaje.

> ⚠️ **Upišite stvarno vrijeme dolaska i odlaska** — ne trenutak kad unosite podatke i ne datum računa. eVisitor iz tih vremena računa noćenja i boravišnu pristojbu: boravak nakon 18:00 broji se kao još jedno noćenje, a dolazak prije 06:00 kao prethodni dan.

### Odjava

Otvorite boravak i pritisnite **Odjavi gosta** te upišite **stvarno** vrijeme odlaska. eVisitor očekuje odjavu **u roku 24 sata**.

### Kad nešto ne prođe

- **„Na čekanju"** — eVisitor trenutno nije dostupan. Aplikacija **sama pokušava ponovno**; možete i ručno pritisnuti **Pokušaj ponovno**.
- **„Greška"** — eVisitor je odbio podatke (npr. dupla prijava ili kategorija koja ne odgovara dobi gosta). Poruku eVisitora prikazujemo **doslovno** na detalju boravka. Ispravite podatak pa pošaljite ponovno — samo ponavljanje slanja neće pomoći.

> ✅ Prijava se **uvijek prvo spremi kod vas**, pa tek onda šalje. Ako eVisitor nije dostupan, boravak vam neće nestati.

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
| 🔔 Zvono | Obavijesti i podsjetnici (rokovi, prag PDV-a, upozorenja) |
| ❓ Pomoć | Otvara ove upute |
| 🔄 Osvježi | Ponovno učitava aplikaciju |
| 🌗 Tema | Prebacuje svijetli/tamni prikaz |

Klik na logo **Visitors** vas uvijek vraća na početni ekran. Na računalu i tabletu su vaš profil i **odjava** u dnu lijevog izbornika; na mobitelu ih nađete pod **Više**.

---

## 💡 Savjeti i česta pitanja

- **Ne mogu izdati račun?** Provjerite je li profil potpun (OIB, adresa, prostor, naplatni uređaj) — semafor na početnoj pokazuje što nedostaje.
- **Račun je „na čekanju"?** Fiskalizacija nije uspjela; pokrenite naknadnu fiskalizaciju na detalju računa.
- **Pogriješio sam na računu?** Ne brišite ga — **stornirajte** ga i izdajte novi.
- **Mijenjam status PDV-a?** Koristite čarobnjak u „Porezne obveze" i upišite datum od kojeg vrijedi.

> ✅ **Zlatno pravilo:** Kad god niste sigurni oko poreza, uskladite se sa svojim knjigovođom. Aplikacija vam olakšava evidenciju i upozorava na rizike, ali ne zamjenjuje stručni savjet.

---

*Sretno s radom! Visitors je tu da vam administracija oduzme što manje vremena.*
