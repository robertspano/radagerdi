# Ráðagerði — vefur, CMS og gjafabréf

**Vefurinn í loftinu:** <https://radagerdi.onrender.com> · **Efnisstjórnun:** <https://radagerdi.onrender.com/admin>

---

## Fyrir samstarfsfólk — svona breytirðu vefnum

```bash
git clone https://github.com/robertspano/radagerdi.git
cd radagerdi
npm install
node server.js          # vefurinn á http://localhost:8787
```

Breyttu skránum, prófaðu staðbundið, og pushaðu:

```bash
git add -A
git commit -m "lýsing á breytingunni"
git push
```

> **Push á `main` fer sjálfkrafa í loftið.** Render tekur við breytingunni um leið
> og hún er komin á GitHub og uppfærir <https://radagerdi.onrender.com> á ~40 sekúndum.
> Ekkert handvirkt skref, enginn Render-aðgangur nauðsynlegur.
> Stöðuna má sjá á [Render dashboard](https://dashboard.render.com) eða í `Actions`-flipanum á GitHub.

### Gott að vita áður en þú byrjar

- **Engir pakkar, enginn build.** `server.js` er allur bakendinn (hreint Node, engar
  útgáfuháðar). Hver síða er sjálfstæð `.html` skrá með sínu CSS inni í `<style>`.
- **CMS-breytingar vistast varanlega.** Það sem breytt er í CMS-inu á netinu
  fer í `content/content.json` og þjónninn speglar skrána (og myndir sem hlaðið
  er upp) beint í þetta repo — þú sérð þær sem commit með skilaboðunum
  „CMS: efni uppfært af vefnum“. Ekki breyta `content/content.json` handvirkt og
  pusha; þá skrifarðu yfir það sem eigandinn hefur gert í CMS-inu.
- **Gjafabréf og lykilorð fara aldrei í repo-ið** (`content/giftcards.json`,
  `content/auth.json` eru áfram í `.gitignore` — repo-ið er opinbert).
- **Leyndarmál fara aldrei í repo-ið** — API-lyklar og netfangalistar eru
  umhverfisbreytur á Render (`Environment`-flipinn).
- Prófaðu alltaf **í síma-breidd líka** (375px) áður en þú pushar — allar síður eiga
  að vera lausar við lárétt skrun.

### Uppbygging

| Slóð | Hlutverk |
|------|----------|
| `server.js` | Þjónninn: kyrrar skrár, innskráning, efnis-API, myndir, gjafabréf |
| `cms/` | Ritillinn (`cms-inject.js` birtir efni, `cms-editor.js` er ritstjórnarlagið) |
| `content/` | Vistað efni, gjafabréf, upphlaðnar myndir *(ekki í git)* |
| `assets/`, `fonts/`, `css/`, `js/` | Myndir, letur og stílar |
| `render.yaml` | Hýsingarstillingar |

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

## Síður

**Íslenska:** `index.html` (forsíða) · `matsedlar.html` (matseðill) · `drykkir.html` ·
`eftirrettir.html` · `takeaway.html` · `brons.html` · `hopar.html` (+ `hoparhadegi`,
`hoparkvold`, `hoparbrons`) · `veisluthjonusta.html` · `myndir.html` ·
`um-okkur.html` · `hafa-samband.html`

**English:** `en.html` · `en-matsedlar.html` · `en-drykkir.html` · `en-eftirrettir.html` ·
`en-takeaway.html` · `en-brons.html` · `en-hopar.html` · `en-veisluthjonusta.html` ·
`en-myndir.html` · `en-about-us.html` · `en-contact-us.html` ·
`en-seltjarnarnes-iceland-travel-guide.html`

Hver síða er sjálfri sér næg: haus, hamborgaravalmynd, efni og fótur í einni skrá.
EN/IS-takkarnir efst tengja saman samsvarandi síður.

## Það sem gott er að vita

- **Litir:** grænn `#629F67`, rauður/terracotta `#FF3031`, texti `#1A1B1F`.
- **Letur:** Windsor (grænar fyrirsagnir), Knockout HTF (þéttur hástafatexti /
  merki), Montserrat (megintexti — sótt frá Google Fonts þegar nettenging er til).
- **Þriðju-aðila skriftur** (jQuery, Google WebFont-loader, Finsweet) hlaðast frá
  sínum opinberu CDN-um þegar tölvan er nettengd — nákvæmlega eins og upprunalega síðan.
- **Síður sem ekki voru afritaðar** (`/en/…`, gjafakort, jólaseðill) vísa áfram á
  raunverulega vefinn radagerdi.is svo hlekkir virki.
