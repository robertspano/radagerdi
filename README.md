# Ráðagerði — vefur, CMS og gjafabréf

## Hýsing á Render (allt virkt á netinu)

Repo-ið er tilbúið fyrir [Render](https://render.com) — `render.yaml` lýsir öllu:

1. Stofnaðu aðgang á render.com (innskráning með GitHub er einfaldast).
2. **New + → Blueprint** → veldu repo-ið `robertspano/radagerdi` → **Apply**.
3. Render setur upp þjóninn + 1GB gagnadisk (`/data`) sjálfkrafa (Starter, ~7$/mán).
4. Vefurinn birtist á `https://radagerdi.onrender.com` (eða álíka) — þar virkar **allt**: vefur, `/admin`, gjafabréf og `/skann` (HTTPS → myndavélin virkar á síma/iPad).
5. **Fyrsta verk: breyttu lykilorðinu** (⋯ → Breyta lykilorði) — sjálfgefið er `radagerdi`.

Gögn (efni, gjafabréf, myndir) geymast á disknum og lifa af allar enduruppfærslur.
Eigið lén (t.d. undirlén af radagerdi.is) er hægt að tengja í Render → Settings → Custom Domains.

---

# Staðbundin eftirmynd af radagerdi.is

Sjálfstæð (offline) eftirmynd af vefsíðunni <https://www.radagerdi.is/>.
Allt HTML, CSS, letur, myndir, myndbönd og Webflow-JS er sótt og vísanir
endurskrifaðar í staðbundnar slóðir — síðan lítur eins út og upprunalega.

## Keyra síðuna + CMS

Síðan keyrir núna á litlum **Node.js þjóni** sem þjónustar bæði vefinn og
efnisstjórnunarkerfið (CMS). Engir aukapakkar — bara Node.

```bash
cd ~/raðagerði
node server.js
```

Þá opnast:
- **Vefurinn:** <http://localhost:8787/>
- **Efnisstjórnun (admin):** <http://localhost:8787/admin>

> Sjálfgefið lykilorð: **`radagerdi`** — breyttu því strax í admin → **Stillingar**.

### Hvernig CMS-ið virkar

Farðu á `/admin`, skráðu þig inn, og þú lendir á vefnum sjálfum með
**ritstjórnarlagi** ofan á. Þú sérð síðuna nákvæmlega eins og hún er og ritstýrir beint:

| Aðgerð | Hvernig |
|--------|---------|
| **Breyta texta** | Smelltu á hvaða texta sem er → skrifaðu → smelltu annað. Á við *allan* texta. |
| **Skipta um mynd** | Farðu yfir mynd → „🖼 Skipta um mynd" → veldu mynd úr tölvunni. |
| **Bæta við rétti** | Neðst í hverjum flokki: „＋ Bæta við rétti". |
| **Eyða / færa rétt** | Farðu yfir rétt → ⬆ ⬇ (færa), ⎘ (afrita), 🗑 (eyða). |
| **Afsláttur** | Farðu yfir rétt → „%" → sláðu inn fullt verð + tilboðsverð (fullt verð verður yfirstrikað). |
| **Færa/fela matseðla** | Toolbar → „Matseðlar" → endurraðaðu flipa eða feldu þá. |
| **Skipta um síðu** | Toolbar → „Síða" fellivalmynd (allar 9 síðurnar). |
| **Vista** | Toolbar → „Vista breytingar". Breytingar birtast strax á vefnum fyrir gesti. |
| **Lykilorð** | Toolbar → „Stillingar". |

Allt efni geymist í `content/content.json`. Ritilinn sést **aðeins** þegar þú ert
innskráð(ur); venjulegir gestir sjá bara vefinn.

### Gjafabréf

| Skref | Hvernig |
|-------|---------|
| **Búa til** | Ritham → „⋯" → **🎁 Gjafabréf** → nafn, sími, inneign → „Búa til" → afritaðu hlekkinn og sendu viðskiptavininum. |
| **Viðskiptavinur** | Opnar hlekkinn (`/gjafabref/<kóði>`) — fallegt kort með QR-kóða og inneign. Getur vistað á heimaskjá símans („Bæta við heimaskjá") svo það sé alltaf við höndina. |
| **Nota á staðnum** | Starfsfólk opnar **`/skann`** (þarf innskráningu), skannar QR-kóðann af síma viðskiptavinarins (eða límir hlekkinn inn), slær inn upphæð → dregst af inneigninni. Ef upphæðin er hærri en inneignin sýnir skanninn eftirstöðvar til greiðslu. |

- Gjafabréf geymast í `content/giftcards.json` (með hreyfingasögu).
- Kortasíðan uppfærir inneign sjálfkrafa þegar hún er opnuð aftur.
- **Ath. myndavélin á /skann** virkar aðeins yfir HTTPS eða á localhost (öryggisregla vafra). Á þessari tölvu virkar hún beint; til að skanna með síma/spjaldtölvu þarf HTTPS-hlekk (göng eða hýsingu). Handvirka leiðin (líma hlekk) virkar alltaf.
- Alvöru „Add to Apple Wallet" (.pkpass) krefst Apple Developer vottorðs — vefkortið hér virkar á öllum símum án þess; hægt að bæta .pkpass við seinna.

> Athugið: keyrðu alltaf **í gegnum `node server.js`**, ekki með því að tvísmella á
> `index.html` — annars hleðst hvorki letrið, myndbandið né CMS-ið.

## Síður (allar staðbundnar, allir hlekkir virka)

**Íslenska:**
| Skrá | Innihald |
|------|----------|
| `index.html`        | Forsíða (hero-myndband, þriggja-rétta borði, matseðilshnappar, footer) |
| `matsedill.html`    | Matseðill með flipum — `?tab=` virkar (Matseðill / Bröns / Take Away / Hópar) |
| `um-okkur.html`     | Um okkur |
| `hafa-samband.html` | Hafa samband (form) |

**English (EN-hnappurinn):**
| Skrá | Innihald |
|------|----------|
| `en-radagerdi.html` | English home |
| `en-menu.html`      | Menu (tabs: Menu / Brunch / Take Away / Groups) |
| `en-about-us.html`  | About us |
| `en-contact-us.html`| Contact us |
| `en-seltjarnarnes-iceland-travel-guide.html` | Seltjarnarnes travel guide |

**Möppur:**
| Mappa | Innihald |
|-------|----------|
| `css/`    | Webflow-stílblaðið (letur- og myndavísanir staðbundnar, `../fonts/` `../assets/`) |
| `fonts/`  | Windsor + Knockout HTF + öll leturafbrigði (.otf/.ttf) |
| `assets/` | Myndir, SVG-tákn, hero-myndband (mp4/webm) + poster |
| `js/`     | Webflow-skriftur (valmynd, flipar, hreyfingar) |

**Ytri hlekkir (haldast eins og á raunvefnum):** „Bóka borð" og „Gjafakort" → dineout.is bókunarkerfið; samfélagsmiðlar → Facebook/Instagram/TripAdvisor; kort-táknið → Google Maps. Óvirkar árstíðasíður (jólaseðill, holiday/new-years menu) vísa á raunvefinn eins og þær gera þar (þær eru faldar/404).

## Það sem gott er að vita

- **Litir:** grænn `#629F67`, rauður/terracotta `#FF3031`, texti `#1A1B1F`.
- **Letur:** Windsor (grænar fyrirsagnir), Knockout HTF (þéttur hástafatexti /
  merki), Montserrat (megintexti — sótt frá Google Fonts þegar nettenging er til).
- **Þriðju-aðila skriftur** (jQuery, Google WebFont-loader, Finsweet) hlaðast frá
  sínum opinberu CDN-um þegar tölvan er nettengd — nákvæmlega eins og upprunalega síðan.
- **Síður sem ekki voru afritaðar** (`/en/…`, gjafakort, jólaseðill) vísa áfram á
  raunverulega vefinn radagerdi.is svo hlekkir virki.
