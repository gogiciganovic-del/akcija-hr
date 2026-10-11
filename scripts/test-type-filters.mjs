/**
 * Unit: typeFallbackFilters (merged from _tmp_test_*_filters.mjs).
 * Usage: npm run test:type-filters
 */
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const {
  bananaSubtypeMismatch,
  brasnoSubtypeMismatch,
  cajSubtypeMismatch,
  isBananaCipsProduct,
  isBananaKasicaProduct,
  isBrasnoBezglutenProduct,
  isBrasnoKukuruzProduct,
  isBrasnoPizzaProduct,
  isCajCrniProduct,
  isCajKamilicaProduct,
  isCajLedeniProduct,
  isCajMentaProduct,
  isCajVocniProduct,
  isCajZeleniProduct,
  isJogurtDrinkProduct,
  isJogurtFlavoredProduct,
  isMaslacCosmeticProduct,
  isMaslacIngredientProduct,
  isMlijekoCosmeticProduct,
  isMlijekoFlavoredProduct,
  isMlijekoLactoseFreeProduct,
  isMozzarellaProduct,
  isNjokiProduct,
  isNonDryPastaProduct,
  isPeanutMaslacProduct,
  isPecivoCroissantProduct,
  isPecivoKrafnaProduct,
  isReadyMealOrMeatProduct,
  isPopcornProduct,
  isRizaArborioProduct,
  isRizaBasmatiProduct,
  isSecerPrahProduct,
  isSecerSmediProduct,
  isSecerZelirProduct,
  isSokNektarProduct,
  isSokSmoothieProduct,
  isSunkaPrsutProduct,
  isSunkaSlaninaProduct,
  isSvjeziMekiSirProduct,
  isToiletPaperName,
  isTopljeniSirProduct,
  isVrhnjeWhipProduct,
  isWetToiletPaperName,
  jogurtSubtypeMismatch,
  keksFamilyId,
  kruhFamilyId,
  maslacFamilyId,
  mlijekoSubtypeMismatch,
  papirSubtypeMismatch,
  pecivoSubtypeMismatch,
  preferMeatCutCandidates,
  queryWantsNaturalHardCheese,
  rizaSubtypeMismatch,
  secerSubtypeMismatch,
  shouldSkipTypeFallbackCandidate,
  shouldSkipTypeFallbackQuery,
  sirSubtypeMismatch,
  sokSubtypeMismatch,
  sunkaSubtypeMismatch,
  tjesteninaSubtypeMismatch,
  vrhnjeSubtypeMismatch,
} = await server.ssrLoadModule("/src/lib/typeFallbackFilters.js");

let failed = 0;
function assert(name, cond, detail) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.log(`FAIL  ${name}`, detail ?? "");
  }
}

// --- banana ---
{
const Q_SVJEZE = "BIO BANANE 700 GR";
const Q_BANANE = "Banane";
const Q_CIPS = "ČIPS OD BANANE BIO 500 g NUTRIGOLD";
const Q_CHIPS = "Vedrini Banana chips 400g";
const Q_KASICA = "Hipp Kašica kruš.i banana s dvop.bio190g";
const Q_HIPP_DESERT = "DESERT MLIJECNI BANANA KAKAO 4X100 G HIPP";
const Q_CASALI = "DESERT CASALI ČOKO BANANE MINI 110 g";
const Q_NEKTAR = "Nektar od banane 25%";
const Q_MUSLI = "Müsli pločice banana";

assert("čips word", isBananaCipsProduct(Q_CIPS) === true);
assert("chips ascii", isBananaCipsProduct(Q_CHIPS) === true);
assert("svježe not čips", isBananaCipsProduct(Q_SVJEZE) === false);
assert("casali not čips", isBananaCipsProduct(Q_CASALI) === false);

assert("kašica word", isBananaKasicaProduct(Q_KASICA) === true);
assert("hipp desert", isBananaKasicaProduct(Q_HIPP_DESERT) === true);
assert("svježe not kašica", isBananaKasicaProduct(Q_SVJEZE) === false);
assert("čips not kašica", isBananaKasicaProduct(Q_CIPS) === false);

assert(
  "svježe skips čips",
  shouldSkipTypeFallbackCandidate(Q_CIPS, "banana", Q_SVJEZE) === true
);
assert(
  "svježe skips chips",
  shouldSkipTypeFallbackCandidate(Q_CHIPS, "banana", Q_BANANE) === true
);
assert(
  "svježe skips kašica",
  shouldSkipTypeFallbackCandidate(Q_KASICA, "banana", Q_SVJEZE) === true
);
assert(
  "svježe skips hipp desert",
  shouldSkipTypeFallbackCandidate(Q_HIPP_DESERT, "banana", Q_SVJEZE) === true
);
assert(
  "svježe keeps svježe",
  shouldSkipTypeFallbackCandidate("BANANE rfz", "banana", Q_BANANE) === false
);
assert(
  "svježe keeps casali leftover",
  shouldSkipTypeFallbackCandidate(Q_CASALI, "banana", Q_SVJEZE) === false
);
assert(
  "svježe keeps nektar leftover",
  shouldSkipTypeFallbackCandidate(Q_NEKTAR, "banana", Q_BANANE) === false
);
assert(
  "svježe keeps müsli leftover",
  shouldSkipTypeFallbackCandidate(Q_MUSLI, "banana", Q_BANANE) === false
);
assert("svježe query not skipped", shouldSkipTypeFallbackQuery(Q_SVJEZE) === false);

assert(
  "čips keeps čips",
  shouldSkipTypeFallbackCandidate("BANANA CHIPS NATURA 100 g", "banana", Q_CIPS) === false
);
assert(
  "čips skips svježe",
  shouldSkipTypeFallbackCandidate(Q_SVJEZE, "banana", Q_CIPS) === true
);
assert(
  "čips skips kašica",
  shouldSkipTypeFallbackCandidate(Q_KASICA, "banana", Q_CHIPS) === true
);

assert(
  "kašica keeps kašica",
  shouldSkipTypeFallbackCandidate("Hippis bio jabuka banana jagoda 100 g", "banana", Q_KASICA) === false
);
assert(
  "kašica skips svježe",
  shouldSkipTypeFallbackCandidate(Q_SVJEZE, "banana", Q_KASICA) === true
);
assert(
  "kašica skips čips",
  shouldSkipTypeFallbackCandidate(Q_CIPS, "banana", Q_KASICA) === true
);

assert("mismatch svježe vs čips", bananaSubtypeMismatch(Q_SVJEZE, Q_CIPS) === true);
assert("same čips ok", bananaSubtypeMismatch(Q_CIPS, Q_CHIPS) === false);
assert("other typeKey ignores banana", shouldSkipTypeFallbackCandidate(Q_CIPS, "sok", Q_SVJEZE) === false);
}

// --- brasno ---
{
const Q_INT = "BRAŠNO K PLUS PŠENIČNO INTEGRALNO 1kg";
const Q_INT2 = "BRAŠNO INTEGRALNO PŠENIČNO 1kg";
const Q_KUK = "Kukuruzno brašno, 1kg";
const Q_PIZZA = "BRASNO ZA PIZZE 1KG, MOLINO CHIAVAZZA";
const Q_SCHAER = "BRASNO MIX B 1KG DR. SCHAER";
const Q_T00 = "BRAŠNO PŠ. BIJ. T-00 FARINA SPEC. 1 kg";
const Q_KOLAC = "BRAŠNO NAMJ ZA KOL T-400 1kg ČAK ML";
const Q_GLATKO = "BRAŠNO GLATKO T-550 1kg";

assert("kukuruz word", isBrasnoKukuruzProduct(Q_KUK) === true);
assert("kukuruzno", isBrasnoKukuruzProduct("BRAŠNO ČM 1kg KUKURUZNO") === true);
assert("integral not kukuruz", isBrasnoKukuruzProduct(Q_INT) === false);

assert("pizza word", isBrasnoPizzaProduct(Q_PIZZA) === true);
assert("pizzu", isBrasnoPizzaProduct("BRASNO ZA PIZZU 1 KG") === true);
assert("integral not pizza", isBrasnoPizzaProduct(Q_INT) === false);

assert("schaer", isBrasnoBezglutenProduct(Q_SCHAER) === true);
assert("bez glutena", isBrasnoBezglutenProduct("No No Premium mix brašno bez glut.1kg") === true);
assert("integral not bezgluten", isBrasnoBezglutenProduct(Q_INT) === false);
assert("bare mix not bezgluten", isBrasnoBezglutenProduct("BRAŠNO MIX 1kg") === false);

assert(
  "integral skips kukuruz",
  shouldSkipTypeFallbackCandidate(Q_KUK, "brasno", Q_INT) === true
);
assert(
  "integral skips kukuruzno ČM",
  shouldSkipTypeFallbackCandidate("BRAŠNO ČM 1kg KUKURUZNO", "brasno", Q_INT2) === true
);
assert(
  "integral skips pizza",
  shouldSkipTypeFallbackCandidate(Q_PIZZA, "brasno", Q_INT) === true
);
assert(
  "integral skips schaer",
  shouldSkipTypeFallbackCandidate(Q_SCHAER, "brasno", Q_INT2) === true
);
assert(
  "integral keeps integral",
  shouldSkipTypeFallbackCandidate("BRAŠNO INTEGRALNO FARINA 1 kg", "brasno", Q_INT) === false
);
assert(
  "integral keeps T-00 leftover",
  shouldSkipTypeFallbackCandidate(Q_T00, "brasno", Q_INT) === false
);
assert(
  "integral keeps kolač leftover",
  shouldSkipTypeFallbackCandidate(Q_KOLAC, "brasno", Q_INT2) === false
);
assert("integral query not skipped", shouldSkipTypeFallbackQuery(Q_INT) === false);

assert(
  "kukuruz keeps kukuruz",
  shouldSkipTypeFallbackCandidate("BRAŠNO KUKURUZNO 1kg PODRAVKA", "brasno", Q_KUK) === false
);
assert(
  "kukuruz skips pizza",
  shouldSkipTypeFallbackCandidate(Q_PIZZA, "brasno", Q_KUK) === true
);
assert(
  "kukuruz skips integral",
  shouldSkipTypeFallbackCandidate(Q_INT, "brasno", Q_KUK) === true
);

assert(
  "pizza keeps pizza",
  shouldSkipTypeFallbackCandidate("BRAŠNO PŠEN PIZZA 1kg ČAK MLIN", "brasno", Q_PIZZA) === false
);
assert(
  "pizza skips kukuruz",
  shouldSkipTypeFallbackCandidate(Q_KUK, "brasno", Q_PIZZA) === true
);

assert(
  "glatko typeKey does not apply brasno filter",
  shouldSkipTypeFallbackCandidate(Q_KUK, "brasno_glatko", Q_GLATKO) === false
);
assert(
  "ostro typeKey does not apply brasno filter",
  shouldSkipTypeFallbackCandidate(Q_PIZZA, "brasno_ostro", "BRAŠNO OŠTRO T-400 1kg") === false
);

assert("mismatch integral vs kukuruz", brasnoSubtypeMismatch(Q_INT, Q_KUK) === true);
assert("same kukuruz ok", brasnoSubtypeMismatch(Q_KUK, "BRAŠNO KUKURUZNO 1kg") === false);
}

// --- caj ---
{
const Q_CRNI = "Naturavita čaj crni 20x1,5g";
const Q_CRNI_LIMUN = "CRNI ČAJ S OKUSOM LIMUNA 50g (F25)";
const Q_VOCNI = "ČAJ VOĆNI WINTER TIME 20/1 50g TEEKANNE";
const Q_SUMSKO = "ČAJ ŠUMSKO VOĆE NATURAVITA 60 g";
const Q_KAMILICA = "ČAJ K PLUS KAMILICA RINFUZA 40g";
const Q_KAMILICA_CVIJET = "CAJ KAMILICA CVIJET 50 G AGRISTAR";
const Q_SIPAK = "Čaj od šipka";
const Q_EARL = "ČAJ AHMAD EARL GREY 50g";
const Q_KADULJA = "NATURAVITA ČAJ KADULJA 20X1,75g";
const Q_LEDENI = "Ledeni čaj breskva sa šećerom, 1,5l";
const Q_MENTA = "CAJ MENTA 20X1,5 G AGRISTAR";
const Q_ZELENI = "ČAJ ZELENI 50g TWININGS";
const Q_MOMENTS = "Teekanne čaj magic moments 20fv 50g";
const Q_ROOIBOS = "English Tea Shop Čaj rooibos bio 40g";
const Q_FIGURICE = "ČAJ BOŽIĆNE FIGURICE 10/1 20g ETS";
const Q_SEDAM = "Agristar čaj sedam biljaka 50 g";
const Q_UVIN = "ČAJ NATURAVITA UVIN H 60 g";

assert("ledeni word", isCajLedeniProduct(Q_LEDENI) === true);
assert("ice tea", isCajLedeniProduct("Jana Ice tea breskva 1,5l") === true);
assert("vrećica not ledeni", isCajLedeniProduct(Q_CRNI) === false);

assert("kamilica word", isCajKamilicaProduct(Q_KAMILICA) === true);
assert("crni not kamilica", isCajKamilicaProduct(Q_CRNI) === false);

assert("menta word", isCajMentaProduct(Q_MENTA) === true);
assert("od mente", isCajMentaProduct("Čaj od mente") === true);
assert("peppermint", isCajMentaProduct("Čaj peppermint 20/1") === true);
assert("moments not menta", isCajMentaProduct(Q_MOMENTS) === false);

assert("zeleni word", isCajZeleniProduct(Q_ZELENI) === true);
assert("crni not zeleni", isCajZeleniProduct(Q_CRNI) === false);

assert("crni word", isCajCrniProduct(Q_CRNI) === true);
assert("breakfast", isCajCrniProduct("ČAJ ENGLISH BREAKF. FRANCK 40 g") === true);
assert("rooibos not crni", isCajCrniProduct(Q_ROOIBOS) === false);
assert("earl grey not crni word", isCajCrniProduct(Q_EARL) === false);

assert("voćni word", isCajVocniProduct(Q_VOCNI) === true);
assert("šumsko", isCajVocniProduct(Q_SUMSKO) === true);
assert("crni limun not voćni", isCajVocniProduct(Q_CRNI_LIMUN) === false);

assert(
  "crni skips menta",
  shouldSkipTypeFallbackCandidate(Q_MENTA, "caj", Q_CRNI) === true
);
assert(
  "crni skips od mente",
  shouldSkipTypeFallbackCandidate("Čaj od mente", "caj", Q_CRNI) === true
);
assert(
  "crni skips zeleni",
  shouldSkipTypeFallbackCandidate(Q_ZELENI, "caj", Q_CRNI) === true
);
assert(
  "crni skips kamilica",
  shouldSkipTypeFallbackCandidate(Q_KAMILICA, "caj", Q_CRNI) === true
);
assert(
  "crni skips voćni",
  shouldSkipTypeFallbackCandidate(Q_VOCNI, "caj", Q_CRNI) === true
);
assert(
  "crni skips ledeni",
  shouldSkipTypeFallbackCandidate(Q_LEDENI, "caj", Q_CRNI) === true
);
assert(
  "crni keeps crni",
  shouldSkipTypeFallbackCandidate("ČAJ CRNI CEYLON 20X2g AHMAD", "caj", Q_CRNI) === false
);
assert(
  "crni keeps Earl Grey leftover",
  shouldSkipTypeFallbackCandidate(Q_EARL, "caj", Q_CRNI) === false
);
assert(
  "crni keeps kadulja leftover",
  shouldSkipTypeFallbackCandidate(Q_KADULJA, "caj", Q_CRNI) === false
);
assert(
  "crni keeps moments leftover",
  shouldSkipTypeFallbackCandidate(Q_MOMENTS, "caj", Q_CRNI_LIMUN) === false
);
assert("crni query not skipped", shouldSkipTypeFallbackQuery(Q_CRNI) === false);

assert(
  "voćni skips crni",
  shouldSkipTypeFallbackCandidate(Q_CRNI, "caj", Q_VOCNI) === true
);
assert(
  "voćni skips zeleni",
  shouldSkipTypeFallbackCandidate(Q_ZELENI, "caj", Q_VOCNI) === true
);
assert(
  "voćni skips kamilica",
  shouldSkipTypeFallbackCandidate(Q_KAMILICA, "caj", Q_VOCNI) === true
);
assert(
  "voćni skips menta",
  shouldSkipTypeFallbackCandidate(Q_MENTA, "caj", Q_VOCNI) === true
);
assert(
  "voćni skips ledeni",
  shouldSkipTypeFallbackCandidate(Q_LEDENI, "caj", Q_VOCNI) === true
);
assert(
  "voćni keeps voćni",
  shouldSkipTypeFallbackCandidate("ČAJ PODRAVKA BOROVNICA 50 g", "caj", Q_VOCNI) === false
);
assert(
  "voćni keeps šipak leftover",
  shouldSkipTypeFallbackCandidate(Q_SIPAK, "caj", Q_VOCNI) === false
);
assert(
  "voćni keeps Earl Grey leftover",
  shouldSkipTypeFallbackCandidate(Q_EARL, "caj", Q_VOCNI) === false
);
assert(
  "voćni keeps uvin leftover",
  shouldSkipTypeFallbackCandidate(Q_UVIN, "caj", Q_SUMSKO) === false
);

assert(
  "kamilica keeps kamilica",
  shouldSkipTypeFallbackCandidate("ČAJ S BUDGET KAMILICA 20 g", "caj", Q_KAMILICA) === false
);
assert(
  "kamilica skips crni",
  shouldSkipTypeFallbackCandidate(Q_CRNI, "caj", Q_KAMILICA) === true
);
assert(
  "kamilica skips rooibos",
  shouldSkipTypeFallbackCandidate(Q_ROOIBOS, "caj", Q_KAMILICA) === true
);
assert(
  "kamilica skips zeleni menta",
  shouldSkipTypeFallbackCandidate("CAJ ZELENI MENTA 40G OMOT FRANCK", "caj", Q_KAMILICA) === true
);
assert(
  "kamilica skips figurice leftover-now-closed",
  shouldSkipTypeFallbackCandidate(Q_FIGURICE, "caj", Q_KAMILICA) === true
);
assert(
  "kamilica skips sedam biljaka leftover-now-closed",
  shouldSkipTypeFallbackCandidate(Q_SEDAM, "caj", Q_KAMILICA_CVIJET) === true
);
assert(
  "kamilica skips ledeni",
  shouldSkipTypeFallbackCandidate(Q_LEDENI, "caj", Q_KAMILICA) === true
);
assert("kamilica query not skipped", shouldSkipTypeFallbackQuery(Q_KAMILICA) === false);

assert(
  "generic šipak skips ledeni",
  shouldSkipTypeFallbackCandidate(Q_LEDENI, "caj", Q_SIPAK) === true
);
assert(
  "generic šipak keeps kamilica leftover",
  shouldSkipTypeFallbackCandidate(Q_KAMILICA, "caj", Q_SIPAK) === false
);
assert(
  "generic Earl Grey keeps crni leftover",
  shouldSkipTypeFallbackCandidate(Q_CRNI, "caj", Q_EARL) === false
);

assert("mismatch crni vs menta", cajSubtypeMismatch(Q_CRNI, Q_MENTA) === true);
assert("same kamilica ok", cajSubtypeMismatch(Q_KAMILICA, "Čaj od kamilice") === false);
assert("other typeKey ignores caj", shouldSkipTypeFallbackCandidate(Q_MENTA, "riza", Q_CRNI) === false);
}

// --- jogurt ---
{
const Q_PLAIN = "JOGURT K PLUS PROACTIVE NATUR 150g";
const Q_GUSTI = "JOGURT GUSTI 1,6% m.m. 180g";
const Q_VOC = "JOGURT VOĆNI JAGODA 150g VINDIJA";
const Q_VOC_JAG = "Dukat Jogurt voćni s jag. 150g";
const Q_VOC_MIX = "JOGURT VOĆNI MIX 8X125g";
const Q_DRINK = "JOGURT TEK ACTIVE ZONE 0.5 % M.M. 180g";

assert("flavored vocni", isJogurtFlavoredProduct(Q_VOC) === true);
assert("flavored voć. abbr", isJogurtFlavoredProduct("Jogobella Jogurt voć.exotic mix3,5%150g") === true);
assert("flavored VOĆ YOGHI", isJogurtFlavoredProduct("JOGURT VOĆ YOGHI FRU K PLUS MIX 150g") === true);
assert("flavored jag. abbr", isJogurtFlavoredProduct("Activia Jogurt jag.1,5%m.m. i žitar.163g") === true);
assert("flavored van. abbr", isJogurtFlavoredProduct("JOGURT EUFORIJA VAN. MIX 150g") === true);
assert("flavored kava", isJogurtFlavoredProduct("JOGURT KAVA 150g") === true);
assert("plain not flavored", isJogurtFlavoredProduct(Q_PLAIN) === false);
assert("gusti not flavored", isJogurtFlavoredProduct(Q_GUSTI) === false);
assert("cashedukat not flavored", isJogurtFlavoredProduct("JOGURT 3.2% 180g ČAŠA DUKAT") === false);

assert("drink tek active", isJogurtDrinkProduct(Q_DRINK) === true);
assert("drink tekući", isJogurtDrinkProduct("Dukat tekući jogurt 2,8%, 1kg") === true);
assert("drink drink-word", isJogurtDrinkProduct("Z BREGOV DRINK JOGURT MIX 150 G VINDIJA") === true);
assert("plain not drink", isJogurtDrinkProduct(Q_PLAIN) === false);
assert("vocni cup not drink", isJogurtDrinkProduct(Q_VOC) === false);

assert(
  "plain keeps natur",
  shouldSkipTypeFallbackCandidate("Dukatos Natur jogurt, 150g", "jogurt", Q_PLAIN) === false
);
assert(
  "plain skips kava",
  shouldSkipTypeFallbackCandidate("JOGURT KAVA 150g", "jogurt", Q_PLAIN) === true
);
assert(
  "plain skips voć.exotic",
  shouldSkipTypeFallbackCandidate("Jogobella Jogurt voć.exotic mix3,5%150g", "jogurt", Q_PLAIN) === true
);
assert(
  "plain skips van. mix",
  shouldSkipTypeFallbackCandidate("JOGURT EUFORIJA VAN. MIX 150g", "jogurt", Q_PLAIN) === true
);
assert(
  "gusti skips jag.",
  shouldSkipTypeFallbackCandidate("Activia Jogurt jag.1,5%m.m. i žitar.163g", "jogurt", Q_GUSTI) === true
);
assert(
  "gusti skips tek active",
  shouldSkipTypeFallbackCandidate(Q_DRINK, "jogurt", Q_GUSTI) === true
);

assert(
  "vocni keeps vocni",
  shouldSkipTypeFallbackCandidate("JOGURT VOĆNI JAGODA 400 g", "jogurt", Q_VOC) === false
);
assert(
  "vocni keeps VOĆ. abbr",
  shouldSkipTypeFallbackCandidate("JOGURT VOĆ.DUKATINO MIX 125 g", "jogurt", Q_VOC_MIX) === false
);
assert(
  "vocni keeps VOĆ YOGHI",
  shouldSkipTypeFallbackCandidate("JOGURT VOĆ YOGHI FRU K PLUS MIX 150g", "jogurt", Q_VOC_MIX) === false
);
assert(
  "vocni skips natur",
  shouldSkipTypeFallbackCandidate("Dukatos Natur jogurt, 150g", "jogurt", Q_VOC_JAG) === true
);
assert(
  "vocni skips cashedukat",
  shouldSkipTypeFallbackCandidate("JOGURT 3.2% 180g ČAŠA DUKAT", "jogurt", "JOGURT JOGO VOĆNI DUKAT 150 g") === true
);
assert(
  "vocni skips drink mix",
  shouldSkipTypeFallbackCandidate("Z BREGOV DRINK JOGURT MIX 150 G VINDIJA", "jogurt", Q_VOC_MIX) === true
);
assert(
  "vocni cup skips fruit drink",
  shouldSkipTypeFallbackCandidate("Tekući jogurt jagoda", "jogurt", Q_VOC) === true
);
assert(
  "vocni leftover kava kept",
  shouldSkipTypeFallbackCandidate("JOGURT KAVA 150g", "jogurt", Q_VOC) === false
);
assert("vocni query not skipped", shouldSkipTypeFallbackQuery(Q_VOC) === false);

assert(
  "drink keeps drink",
  shouldSkipTypeFallbackCandidate("Dukat tekući jogurt 2,8%, 1kg", "jogurt", Q_DRINK) === false
);
assert(
  "drink skips cup natur",
  shouldSkipTypeFallbackCandidate("Dukatos Natur jogurt, 150g", "jogurt", Q_DRINK) === true
);
assert("drink query not skipped", shouldSkipTypeFallbackQuery(Q_DRINK) === false);

assert("mismatch voc vs natur", jogurtSubtypeMismatch(Q_VOC, Q_PLAIN) === true);
assert("mismatch natur vs voc", jogurtSubtypeMismatch(Q_PLAIN, Q_VOC) === true);
assert("same natur ok", jogurtSubtypeMismatch(Q_PLAIN, "Dukatos Natur jogurt, 150g") === false);
}

// --- keks ---
{
const Q_GENERIC = "KEKSI MINI MADELEINES 175G";
const Q_DANSKI = "Jacobsens Keksi danski Winter Vil.340 g";
const Q_CHOCO = "KEKSI CHOCO CHIPS GULLON 150g";
const Q_KREKER = "KREKER SLANI 150 g VIC KRAŠ";
const Q_BISKVIT = "Biskvit rolada SK3, 300g";

assert("family kreker", keksFamilyId("KREKER TUC LUK 100 g") === "kreker");
assert("family vafel", keksFamilyId("Vafel s kremom od lješnjaka") === "vafel");
assert("family napolitanke", keksFamilyId("Napolitanke SK3, UTZ") === "napolitanke");
assert("family biskvit_kolac rolada", keksFamilyId("Biskvit rolada SK3, 300g") === "biskvit_kolac");
assert("family biskvit_kolac plum", keksFamilyId("BISKVIT PLUM CAKE GRČKI JOGURT 192g") === "biskvit_kolac");
assert("family default petit", keksFamilyId("KEKS PETIT 400g KRAŠ") === "keks");
assert("family default classic", keksFamilyId("Zobeni keksi sa sezamom, 210g") === "keks");
assert("kolačići nisu kolač", keksFamilyId("Čajni kolačići 200g") === "keks");

assert(
  "generic skips kreker",
  shouldSkipTypeFallbackCandidate("KREKER SLANI 150 g VIC KRAŠ", "keks", Q_GENERIC) === true
);
assert(
  "generic skips napolitanke",
  shouldSkipTypeFallbackCandidate("NAPOLITANKE CREME 360 g JAFFA", "keks", Q_DANSKI) === true
);
assert(
  "generic skips vafel",
  shouldSkipTypeFallbackCandidate("Vafel keksi SK6", "keks", Q_CHOCO) === true
);
assert(
  "generic skips biskvit rolada",
  shouldSkipTypeFallbackCandidate("Biskvit rolada SK3, 300g", "keks", Q_CHOCO) === true
);
assert(
  "generic skips plain biskvit name",
  shouldSkipTypeFallbackCandidate("Biskvit SK2, SK13, SK20, SK23 400g", "keks", Q_DANSKI) === true
);
assert(
  "generic skips gran cereale biskvit",
  shouldSkipTypeFallbackCandidate("Gran Cereale biskvit Frutta, 250g", "keks", Q_GENERIC) === true
);
assert(
  "generic keeps petit",
  shouldSkipTypeFallbackCandidate("KEKS PETIT 400g KRAŠ", "keks", Q_GENERIC) === false
);
assert(
  "generic keeps classic",
  shouldSkipTypeFallbackCandidate("Zobeni keksi sa sezamom, 210g", "keks", Q_GENERIC) === false
);

assert(
  "always skip baby kašica",
  shouldSkipTypeFallbackCandidate("KBio.Kašica večernja keks 190g", "keks", Q_GENERIC) === true
);
assert(
  "always skip nutrino",
  shouldSkipTypeFallbackCandidate("TUBA NUTRINO JAB/BAN/KEKS 100 g", "keks", Q_GENERIC) === true
);
assert(
  "always skip hipp",
  shouldSkipTypeFallbackCandidate("KAŠ HIPP BIO JAB I BAN S KEKS 100g", "keks", Q_GENERIC) === true
);
assert(
  "biskvit query still skips rolada candidate",
  shouldSkipTypeFallbackCandidate("Biskvit rolada SK3, 300g", "keks", Q_BISKVIT) === true
);

assert(
  "kreker query keeps kreker",
  shouldSkipTypeFallbackCandidate("Krekeri slani i integralni SK8", "keks", Q_KREKER) === false
);
assert(
  "kreker query skips classic keks",
  shouldSkipTypeFallbackCandidate("KEKS PETIT 400g KRAŠ", "keks", Q_KREKER) === true
);
assert(
  "kreker query skips vafel",
  shouldSkipTypeFallbackCandidate("Vafel s kremom od lješnjaka", "keks", Q_KREKER) === true
);

assert(
  "punjeni still skipped (PROCESSED_FORM_RE)",
  shouldSkipTypeFallbackCandidate("Kinder Cards punjeni keksi", "keks", Q_GENERIC) === true
);
assert(
  "query baby food skipped",
  shouldSkipTypeFallbackQuery("KAŠ HIPP BIO JAB I BAN S KEKS 100g") === true
);
}

// --- kruh ---
{
const Q_BIJELI = "Kruh bijeli rezani 500g PAK";
const Q_POLU = "KRUH POLUBIJELI 500g PAK KLARA";
const Q_CRNI = "KRUH INTEGRALNI KALUP 500g PALIT";
const Q_TOAST = "Toast bijeli 500g";
const Q_BAG = "BO Baguette bijeli";
const Q_GENERIC = "KRUH ISPOD PEK. 500g";

assert("family toast before integral", kruhFamilyId("Integralni toast, 500g") === "toast");
assert("family toast bijeli", kruhFamilyId("Toast bijeli") === "toast");
assert("family tost kruh", kruhFamilyId("Tost kruh (Pan Carr?)") === "toast");
assert("family baguette before bijeli", kruhFamilyId("BO Baguette bijeli") === "baguette");
assert("family baguette pecivo", kruhFamilyId("Baguette pecivo SK1") === "baguette");
assert("family polubijeli before bijeli", kruhFamilyId("KRUH POLUBIJELI 500g PAK KLARA") === "polubijeli");
assert("family bijeli", kruhFamilyId("Kruh bijeli rezani 500g PAK") === "bijeli");
assert("family bijeli integ is crni", kruhFamilyId("KRUH BIJELI INTEG.500 g JELENA") === "crni_integral");
assert("family razeni", kruhFamilyId("RAŽENI MIJEŠANI KRUH 500g") === "crni_integral");
assert("family kukuruz", kruhFamilyId("KRUH KUKURUZNI RASPUCANAC 400g") === "kukuruzni");
assert("family bezgluten", kruhFamilyId("Balviten Kruh bijeli rezani bez glu.190g") === "bezgluten");
assert("family hrskavi", kruhFamilyId("Hrskavi kruh SK5") === "hrskavi");
assert("family slatki marcipan", kruhFamilyId("Mini marcipan kruh SK1") === "slatki");
assert("family ostalo peka", kruhFamilyId("KRUH ISPOD PEK. 500g") === "ostalo");
assert("family rezani stays bijeli", kruhFamilyId("Bijeli rezani kruh") === "bijeli");

assert(
  "bijeli skips toast",
  shouldSkipTypeFallbackCandidate("Integralni toast, 500g", "kruh", Q_BIJELI) === true
);
assert(
  "bijeli skips razeni",
  shouldSkipTypeFallbackCandidate("RAŽENI MIJEŠANI KRUH 500g", "kruh", Q_BIJELI) === true
);
assert(
  "bijeli skips polubijeli",
  shouldSkipTypeFallbackCandidate(Q_POLU, "kruh", Q_BIJELI) === true
);
assert(
  "bijeli skips kukuruz",
  shouldSkipTypeFallbackCandidate("KRUH KUKURUZNI RASPUCANAC 400g", "kruh", Q_BIJELI) === true
);
assert(
  "bijeli skips ostalo peka",
  shouldSkipTypeFallbackCandidate("KRUH ISPOD PEK. 500g", "kruh", Q_BIJELI) === true
);
assert(
  "bijeli skips hrskavi",
  shouldSkipTypeFallbackCandidate("Hrskavi kruh SK5", "kruh", Q_BIJELI) === true
);
assert(
  "bijeli skips flour",
  shouldSkipTypeFallbackCandidate("Kfree.Brašno za kruh bez glutena 457g", "kruh", Q_BIJELI) === true
);
assert(
  "bijeli keeps bijeli",
  shouldSkipTypeFallbackCandidate("KRUH BIJELI PS 500 G OHO", "kruh", Q_BIJELI) === false
);
assert(
  "bijeli skips bijeli integ",
  shouldSkipTypeFallbackCandidate("KRUH BIJELI INTEG.500 g JELENA", "kruh", Q_BIJELI) === true
);

assert(
  "polu keeps polu",
  shouldSkipTypeFallbackCandidate("Kruh polubijeli 600 g", "kruh", Q_POLU) === false
);
assert(
  "polu skips bijeli",
  shouldSkipTypeFallbackCandidate(Q_BIJELI, "kruh", Q_POLU) === true
);
assert(
  "polu skips toast",
  shouldSkipTypeFallbackCandidate("Integralni toast, 500g", "kruh", Q_POLU) === true
);

assert(
  "crni keeps razeni",
  shouldSkipTypeFallbackCandidate("KRUH RAŽENA RUSTIKA 500g NAR PAK KLARA", "kruh", Q_CRNI) === false
);
assert(
  "crni skips integralni toast",
  shouldSkipTypeFallbackCandidate("Integralni toast, 500g", "kruh", Q_CRNI) === true
);
assert(
  "crni skips bijeli",
  shouldSkipTypeFallbackCandidate(Q_BIJELI, "kruh", Q_CRNI) === true
);

assert(
  "toast query keeps toast",
  shouldSkipTypeFallbackCandidate("TOAST INTEGRALNI 400 G PLODINE MULINI", "kruh", Q_TOAST) === false
);
assert(
  "toast query skips bijeli loaf",
  shouldSkipTypeFallbackCandidate(Q_BIJELI, "kruh", Q_TOAST) === true
);

assert(
  "baguette query keeps baguette",
  shouldSkipTypeFallbackCandidate("BO Mini baguette", "kruh", Q_BAG) === false
);
assert(
  "baguette query skips bijeli",
  shouldSkipTypeFallbackCandidate(Q_BIJELI, "kruh", Q_BAG) === true
);

assert(
  "generic skips toast",
  shouldSkipTypeFallbackCandidate("Integralni toast, 500g", "kruh", Q_GENERIC) === true
);
assert(
  "generic keeps ostalo",
  shouldSkipTypeFallbackCandidate("KRUH FINI DOM SMRZ 605 g KLARA", "kruh", Q_GENERIC) === false
);
assert(
  "generic keeps bijeli loaf",
  shouldSkipTypeFallbackCandidate("KRUH BIJELI PS 500 G OHO", "kruh", Q_GENERIC) === false
);

assert(
  "query flour skipped",
  shouldSkipTypeFallbackQuery("Kfree.Brašno za kruh bez glutena 457g") === true
);
assert(
  "query slatki skipped",
  shouldSkipTypeFallbackQuery("Mini marcipan kruh SK1") === true
);
assert(
  "query hrskavi skipped",
  shouldSkipTypeFallbackQuery("Hrskavi kruh SK5") === true
);
assert(
  "query bijeli not skipped",
  shouldSkipTypeFallbackQuery(Q_BIJELI) === false
);
assert(
  "query toast not skipped",
  shouldSkipTypeFallbackQuery(Q_TOAST) === false
);
}

// --- maslac ---
{
const Q_DAIRY = "Maslac 250g Dukat";
const Q_PEANUT = "maslac od kikirikija";
const Q_SALT = "maslac s morskom soli";
const Q_BADEM = "Maslac od badema SK1";
const Q_GHEE = "MASLAC GHEE 300g";
const Q_HERB = "MASLAC SA ZAČINSKIM BILJEM 125g MEGL";

assert("family dairy dukat", maslacFamilyId("MASLAC IKL 250g FOLIJA DUKAT") === "mlijecni");
assert("family dairy slani", maslacFamilyId("MASLAC SLANI 250 g KADICA PRESIDENT") === "mlijecni");
assert("family dairy camargue", maslacFamilyId("Maslac s Camargue morskom soli") === "mlijecni");
assert("family dairy light", maslacFamilyId("MASLAC LIGHT 250g PRESIDENT") === "mlijecni");
assert("family dairy lactose", maslacFamilyId("MASLAC BEZ LAKTOZE 200 g FREE ZONE") === "mlijecni");
assert("family dairy kozji", maslacFamilyId("MASLAC KOZJI 125 g") === "mlijecni");
assert("family dairy spar brand", maslacFamilyId("MASLAC SPAR 250 g") === "mlijecni");
assert("spar is not cosmetic", isMaslacCosmeticProduct("MASLAC SPAR 250 g") === false);

assert("family kikiriki", maslacFamilyId("MASLAC OD KIKIRIKI.SPAR 350 g") === "kikiriki");
assert("family kikiriki query", maslacFamilyId(Q_PEANUT) === "kikiriki");
assert("peanut kik. loacker", isPeanutMaslacProduct("Loacker vafli maslac od kik. 175 g") === true);
assert(
  "peanut kikiri abbr",
  maslacFamilyId("NAMAZ KIKIRI MASL S KOMADIĆIMA 350 G LINO") === "kikiriki"
);
assert("family badem", maslacFamilyId("Maslac od badema SK1") === "orasasti");
assert("family ljesnjak", maslacFamilyId("MASLAC OD LJEŠNJAKA 350g ANNAPURNA") === "orasasti");
assert("family pistacija", maslacFamilyId("MASLAC PISTACIJA 200 G NUTRIGOLD") === "orasasti");
assert("family indijski", maslacFamilyId("Maslac od indijskih oraščića") === "orasasti");
assert("family ghee", maslacFamilyId("MASLAC GHEE 300g") === "ghee");
assert("family herb", maslacFamilyId(Q_HERB) === "aromatizirani");
assert("family zacin", maslacFamilyId("MASLAC ZACIN 125 G MEGGLE") === "aromatizirani");
assert("family trio", maslacFamilyId("MASLAC TRIO 100 G MEGGLE") === "aromatizirani");

assert("cosmetic tijelo", isMaslacCosmeticProduct("Maslac za tijelo SK7") === true);
assert("cosmetic tij abbr", isMaslacCosmeticProduct("MASLAC TIJ AFROD SPA CHER BLOS 200ml") === true);
assert("cosmetic spa", isMaslacCosmeticProduct("MASLAC AFRODITA 100% SPA 200ml") === true);
assert("cosmetic nivea", isMaslacCosmeticProduct("MASLAC NIVEA Q10 AN-WRIN COLLAG 50ml") === true);
assert("cosmetic ml heuristic", isMaslacCosmeticProduct("MASLAC NAJFIN BUR/OR/MRK 100 ml") === true);
assert("cosmetic karite", isMaslacCosmeticProduct("BIOBAZA BEE BALM KARITE MASLAC I AVOKADO 4,5 G") === true);
assert("ghee spray not cosmetic", isMaslacCosmeticProduct("GHEE MASLAC U SPREJU 200 ML MANTOVA") === false);

assert("popcorn kokice", isPopcornProduct("KOKICE MASLAC 100 g BOBI") === true);
assert("popcorn popcorn", isPopcornProduct("POPCORN K PLUS HRUSTY MASLAC 100g") === true);
assert("popcorn smokice", isPopcornProduct("FLIPS SMOKICE MASLAC 85 G") === true);

assert("ingredient keks", isMaslacIngredientProduct("KEKS PETIT MASLAC 450 G BISCOLETTI") === true);
assert("ingredient toast", isMaslacIngredientProduct("TOAST MASLAC S-BUDGET 500 g") === true);
assert("ingredient vafli", isMaslacIngredientProduct("Loacker vafli maslac od kik. 175 g") === true);

assert(
  "dairy keeps dukat",
  shouldSkipTypeFallbackCandidate("MASLAC IKL 250g FOLIJA DUKAT", "maslac", Q_DAIRY) === false
);
assert(
  "dairy keeps slani",
  shouldSkipTypeFallbackCandidate("MASLAC SLANI 250 g KADICA PRESIDENT", "maslac", Q_DAIRY) === false
);
assert(
  "dairy keeps camargue",
  shouldSkipTypeFallbackCandidate("Maslac s Camargue morskom soli", "maslac", Q_DAIRY) === false
);
assert(
  "dairy keeps light",
  shouldSkipTypeFallbackCandidate("MASLAC LIGHT 250g PRESIDENT", "maslac", Q_DAIRY) === false
);
assert(
  "dairy keeps lactose",
  shouldSkipTypeFallbackCandidate("MASLAC BEZ LAKTOZE 200 g FREE ZONE", "maslac", Q_DAIRY) === false
);
assert(
  "dairy keeps kozji",
  shouldSkipTypeFallbackCandidate("MASLAC KOZJI 125 g", "maslac", Q_DAIRY) === false
);
assert(
  "dairy skips peanut",
  shouldSkipTypeFallbackCandidate("MASLAC OD KIKIRIKI.SPAR 350 g", "maslac", Q_DAIRY) === true
);
assert(
  "dairy skips badem",
  shouldSkipTypeFallbackCandidate("Maslac od badema SK1", "maslac", Q_DAIRY) === true
);
assert(
  "dairy skips ghee",
  shouldSkipTypeFallbackCandidate("MASLAC GHEE 300g", "maslac", Q_DAIRY) === true
);
assert(
  "dairy skips herb",
  shouldSkipTypeFallbackCandidate(Q_HERB, "maslac", Q_DAIRY) === true
);
assert(
  "dairy skips cosmetic",
  shouldSkipTypeFallbackCandidate("Maslac za tijelo SK7", "maslac", Q_DAIRY) === true
);
assert(
  "dairy skips popcorn",
  shouldSkipTypeFallbackCandidate("POPCORN K PLUS HRUSTY MASLAC 100g", "maslac", Q_DAIRY) === true
);
assert(
  "dairy skips keks",
  shouldSkipTypeFallbackCandidate("Mješani maslac keksi XXL", "maslac", Q_DAIRY) === true
);

assert(
  "salt query is dairy not herb",
  maslacFamilyId(Q_SALT) === "mlijecni"
);
assert(
  "salt query keeps dairy",
  shouldSkipTypeFallbackCandidate("MASLAC 250g VINDIJA", "maslac", Q_SALT) === false
);
assert(
  "salt query skips herb",
  shouldSkipTypeFallbackCandidate(Q_HERB, "maslac", Q_SALT) === true
);

assert(
  "peanut query keeps peanut",
  shouldSkipTypeFallbackCandidate("MASLAC OD KIKIRIKI.NUTZ 310 g", "maslac", Q_PEANUT) === false
);
assert(
  "peanut query skips dairy",
  shouldSkipTypeFallbackCandidate("MASLAC 250g DUKAT", "maslac", Q_PEANUT) === true
);
assert(
  "peanut query skips cosmetic",
  shouldSkipTypeFallbackCandidate("Maslac za tijelo SK7", "maslac", Q_PEANUT) === true
);
assert(
  "peanut query skips vafli kik",
  shouldSkipTypeFallbackCandidate("Loacker vafli maslac od kik. 175 g", "maslac", Q_PEANUT) === true
);

assert(
  "badem query keeps badem",
  shouldSkipTypeFallbackCandidate("MASLAC OD BADEMA 100% CISTI 350 G NUTRIGOLD", "maslac", Q_BADEM) === false
);
assert(
  "badem query skips dairy",
  shouldSkipTypeFallbackCandidate("MASLAC 250g DUKAT", "maslac", Q_BADEM) === true
);

assert(
  "ghee query keeps ghee",
  shouldSkipTypeFallbackCandidate("Ghee Easy Maslac Bio 245 g", "maslac", Q_GHEE) === false
);
assert(
  "ghee query skips dairy",
  shouldSkipTypeFallbackCandidate("MASLAC 250g DUKAT", "maslac", Q_GHEE) === true
);

assert(
  "herb query keeps herb",
  shouldSkipTypeFallbackCandidate("MASLAC ZACIN 125 G MEGGLE", "maslac", Q_HERB) === false
);
assert(
  "herb query skips dairy",
  shouldSkipTypeFallbackCandidate("MASLAC 250g DUKAT", "maslac", Q_HERB) === true
);

assert(
  "query cosmetic skipped",
  shouldSkipTypeFallbackQuery("Maslac za tijelo SK7") === true
);
assert(
  "query popcorn skipped",
  shouldSkipTypeFallbackQuery("KOKICE MASLAC 100 g BOBI") === true
);
assert(
  "query keks+maslac skipped",
  shouldSkipTypeFallbackQuery("KEKS PETIT MASLAC 450 G BISCOLETTI") === true
);
assert(
  "query plain keks NOT skipped",
  shouldSkipTypeFallbackQuery("KEKS PETIT 400g KRAŠ") === false
);
assert(
  "query dairy not skipped",
  shouldSkipTypeFallbackQuery(Q_DAIRY) === false
);
}

// --- mlijeko ---
{
const Q_COW = "MLIJEKO TRAJNO 2,8% 1L";
const Q_CHOC = "MLIJEKO ČOKOLADNO Z BREGOV 1 L";
const Q_LF = "MLIJEKO BEZ LAKTOZE 1l";
const Q_CHOC_LF = "MLIJEKO ČOK BEZ LAKTOZE UHT 1L";

assert("flavored cokoladno", isMlijekoFlavoredProduct(Q_CHOC) === true);
assert("flavored cok abbr", isMlijekoFlavoredProduct(Q_CHOC_LF) === true);
assert("flavored ascii", isMlijekoFlavoredProduct("MLIJEKO COKOLADNO BIJELA COKOLADA1 L DUKAT") === true);
assert("flavored vanilija", isMlijekoFlavoredProduct("MLIJEKO VANILIJA PROTEIN 0,5 L DUKAT") === true);
assert("cow not flavored", isMlijekoFlavoredProduct(Q_COW) === false);
assert("kakao vafel not flavored", isMlijekoFlavoredProduct("Kraš Frondi Vafel kakao i mlijeko") === false);

assert("lf full", isMlijekoLactoseFreeProduct(Q_LF) === true);
assert("lf lakt abbr", isMlijekoLactoseFreeProduct("MLIJEKO TRAJNO BEZ LAKT.PROTEIN 1l") === true);
assert("cow not lf", isMlijekoLactoseFreeProduct(Q_COW) === false);

assert("cosmetic sun", isMlijekoCosmeticProduct("Mlijeko za sunčanje sensitive ZF 30") === true);

assert(
  "cow keeps cow",
  shouldSkipTypeFallbackCandidate("Dukat Trajno mlijeko 2,8%, 1l-boca", "mlijeko", Q_COW) === false
);
assert(
  "cow skips chocolate",
  shouldSkipTypeFallbackCandidate(Q_CHOC, "mlijeko", Q_COW) === true
);
assert(
  "cow skips vanilla",
  shouldSkipTypeFallbackCandidate("MLIJEKO VANILIJA PROTEIN 0,5 L DUKAT", "mlijeko", Q_COW) === true
);
assert(
  "cow skips lf",
  shouldSkipTypeFallbackCandidate(Q_LF, "mlijeko", Q_COW) === true
);
assert(
  "cow skips lf abbr",
  shouldSkipTypeFallbackCandidate("MLIJEKO TRAJNO BEZ LAKT.PROTEIN 1l", "mlijeko", Q_COW) === true
);
assert(
  "cow skips cosmetic",
  shouldSkipTypeFallbackCandidate("Mlijeko za sunčanje sensitive ZF 30", "mlijeko", Q_COW) === true
);

assert(
  "choc keeps choc",
  shouldSkipTypeFallbackCandidate("MLIJEKO ČOKOLADNO 1 L DUKAT", "mlijeko", Q_CHOC) === false
);
assert(
  "choc skips cow",
  shouldSkipTypeFallbackCandidate(Q_COW, "mlijeko", Q_CHOC) === true
);
assert(
  "choc skips lf plain",
  shouldSkipTypeFallbackCandidate("Trajno mlijeko bez laktoze 1,5%", "mlijeko", Q_CHOC) === true
);
assert(
  "choc query not skipped",
  shouldSkipTypeFallbackQuery(Q_CHOC) === false
);

assert(
  "lf keeps lf",
  shouldSkipTypeFallbackCandidate("Trajno mlijeko bez laktoze 1,5%", "mlijeko", Q_LF) === false
);
assert(
  "lf keeps lakt abbr",
  shouldSkipTypeFallbackCandidate("MLIJEKO TRAJNO BEZ LAKT.PROTEIN 1l", "mlijeko", Q_LF) === false
);
assert(
  "lf skips cow",
  shouldSkipTypeFallbackCandidate(Q_COW, "mlijeko", Q_LF) === true
);
assert(
  "lf skips chocolate cow",
  shouldSkipTypeFallbackCandidate(Q_CHOC, "mlijeko", Q_LF) === true
);

assert(
  "choc+lf query keeps chocolate",
  shouldSkipTypeFallbackCandidate(Q_CHOC, "mlijeko", Q_CHOC_LF) === false
);
assert(
  "choc+lf query skips plain cow",
  shouldSkipTypeFallbackCandidate(Q_COW, "mlijeko", Q_CHOC_LF) === true
);

assert("cosmetic query skipped", shouldSkipTypeFallbackQuery("Mlijeko za sunčanje ZF 30") === true);
assert(
  "mismatch choc vs cow",
  mlijekoSubtypeMismatch(Q_CHOC, Q_COW) === true
);
}

// --- papir ---
{
const Q_DRY = "TOALETNI PAPIR PALOMA DINO 8/1";
const Q_ZEWA = "Zewa Toaletni papir deluxe white3sl.20/1";
const Q_TOAL = "TOAL. PAPIR PAL. 3sl EXC. 10 kom";
const Q_T_PAPIR = "T. papir 8 rola";
const Q_PAPIR_T = "PAPIR T. VLAŽ. 42/1 ZEWA ALMON";
const Q_VL = "VL.TOALETNI PAPIR LOVELY 60/1";
const Q_WET = "TOALETNI PAPIR VLAŽNI 60 M 4kom";
const Q_VLAZNI = "SOFTY VLAZNI TOALETNI PAPIR 60 KOM";
const Q_BAKE = "Papir za pečenje 38x42cm, 30 kom.";
const Q_BAKE_FRITEZA = "PAPIR ZA PECENJE ZA FRITEZU 16 CM 50 KOM";
const Q_KUHINJ = "Kuhinjski ubrusi 4x50 listića 2-sl.";
const Q_CARE = "PAPIR TOALETNI 8/1 ZEWA CARE";

const C_SLAMKE = "SLAMKE PAPIR. 24 kom";
const C_KOSARICE = "KOŠARICE PAPIR. ZA MINJONE 100/1";
const C_VRECE = "VREĆE ZA PAPIR 120 l";
const C_RIZIN = "Rižin papir SK1";
const C_DRY = "Violeta toaletni papir 20/1 3sl Str";
const C_BAKE = "PAPIR ZA PEČENJE 8m FINO";

assert("toaletni is toilet", isToiletPaperName(Q_DRY) === true);
assert("TOAL. is toilet", isToiletPaperName(Q_TOAL) === true);
assert("T. papir is toilet", isToiletPaperName(Q_T_PAPIR) === true);
assert("PAPIR T. is toilet", isToiletPaperName(Q_PAPIR_T) === true);
assert("bake not toilet", isToiletPaperName(Q_BAKE) === false);
assert("slamke not toilet", isToiletPaperName(C_SLAMKE) === false);
assert("kuhinjski not toilet", isToiletPaperName(Q_KUHINJ) === false);
assert("CARE not wet", isWetToiletPaperName(Q_CARE) === false);
assert("dry not wet", isWetToiletPaperName(Q_DRY) === false);
assert("VLAŽ. is wet", isWetToiletPaperName(Q_PAPIR_T) === true);
assert("VL. is wet", isWetToiletPaperName(Q_VL) === true);
assert("vlažni is wet", isWetToiletPaperName(Q_WET) === true);
assert("vlazni ascii is wet", isWetToiletPaperName(Q_VLAZNI) === true);
assert("swiffer not wet-toilet", isWetToiletPaperName("Swiffer vlažni ubrusi za pod") === false);

assert(
  "dry skips slamke",
  shouldSkipTypeFallbackCandidate(C_SLAMKE, "papir", Q_ZEWA) === true
);
assert(
  "dry skips košarice",
  shouldSkipTypeFallbackCandidate(C_KOSARICE, "papir", Q_ZEWA) === true
);
assert(
  "dry skips vreće",
  shouldSkipTypeFallbackCandidate(C_VRECE, "papir", "TOALETNI PAPIR 3 S, 180L, 12R") === true
);
assert(
  "dry skips rižin",
  shouldSkipTypeFallbackCandidate(C_RIZIN, "papir", Q_DRY) === true
);
assert(
  "dry skips kuhinjski",
  shouldSkipTypeFallbackCandidate(Q_KUHINJ, "papir", Q_DRY) === true
);
assert(
  "dry skips bake",
  shouldSkipTypeFallbackCandidate(Q_BAKE, "papir", Q_DRY) === true
);
assert(
  "dry skips wet",
  shouldSkipTypeFallbackCandidate(Q_WET, "papir", Q_DRY) === true
);
assert(
  "dry skips PAPIR T. wet",
  shouldSkipTypeFallbackCandidate(Q_PAPIR_T, "papir", Q_DRY) === true
);
assert(
  "dry keeps dry",
  shouldSkipTypeFallbackCandidate(C_DRY, "papir", Q_ZEWA) === false
);
assert("dry query not skipped", shouldSkipTypeFallbackQuery(Q_DRY) === false);

assert(
  "wet keeps wet",
  shouldSkipTypeFallbackCandidate(Q_WET, "papir", Q_VL) === false
);
assert(
  "wet keeps PAPIR T.",
  shouldSkipTypeFallbackCandidate(Q_PAPIR_T, "papir", Q_VLAZNI) === false
);
assert(
  "wet skips dry",
  shouldSkipTypeFallbackCandidate(Q_DRY, "papir", Q_WET) === true
);
assert(
  "wet skips slamke",
  shouldSkipTypeFallbackCandidate(C_SLAMKE, "papir", Q_VL) === true
);

assert(
  "bake keeps bake",
  shouldSkipTypeFallbackCandidate(C_BAKE, "papir", Q_BAKE) === false
);
assert(
  "bake skips slamke",
  shouldSkipTypeFallbackCandidate(C_SLAMKE, "papir", Q_BAKE) === true
);
assert(
  "bake skips košarice",
  shouldSkipTypeFallbackCandidate(C_KOSARICE, "papir", Q_BAKE_FRITEZA) === true
);
assert(
  "bake skips PAPIR T.",
  shouldSkipTypeFallbackCandidate(Q_PAPIR_T, "papir", Q_BAKE) === true
);
assert(
  "bake skips dry toilet",
  shouldSkipTypeFallbackCandidate(Q_DRY, "papir", Q_BAKE) === true
);
assert(
  "bake skips kuhinjski",
  shouldSkipTypeFallbackCandidate(Q_KUHINJ, "papir", Q_BAKE) === true
);

assert(
  "kuhinjski query does not skip toilet",
  shouldSkipTypeFallbackCandidate(Q_DRY, "papir", Q_KUHINJ) === false
);

assert("mismatch dry vs slamke", papirSubtypeMismatch(Q_DRY, C_SLAMKE) === true);
assert("same dry ok", papirSubtypeMismatch(Q_DRY, C_DRY) === false);
assert("other typeKey ignores papir", shouldSkipTypeFallbackCandidate(C_SLAMKE, "banana", Q_DRY) === false);
}

// --- pecivo ---
{
const Q_KRAFNA = "KRAFNA KAKAO 60 G";
const Q_KRAFNA_MAR = "KRAFNA MARELICA 60g";
const Q_CROISSANT = "CROISSANT CHOCO NOUGAT 75g";
const Q_KROASAN = "Kroasan kakao Chipicao midi 60 g";
const Q_PECIVO = "PECIVO ŽEMLJA 75g PIK RIJEKA";

assert("krafna word", isPecivoKrafnaProduct(Q_KRAFNA) === true);
assert("donut is krafna", isPecivoKrafnaProduct("JAFFA KOLAČ DONUT CHOCO 75 g") === true);
assert("croissant not krafna", isPecivoKrafnaProduct(Q_CROISSANT) === false);
assert("žemlja not krafna", isPecivoKrafnaProduct(Q_PECIVO) === false);

assert("croissant word", isPecivoCroissantProduct(Q_CROISSANT) === true);
assert("kroasan word", isPecivoCroissantProduct(Q_KROASAN) === true);
assert("krafna not croissant", isPecivoCroissantProduct(Q_KRAFNA) === false);
assert("žemlja not croissant", isPecivoCroissantProduct(Q_PECIVO) === false);

assert(
  "krafna keeps krafna",
  shouldSkipTypeFallbackCandidate("BO Krafna marelica, 60g", "pecivo", Q_KRAFNA_MAR) === false
);
assert(
  "krafna skips kroasan kakao",
  shouldSkipTypeFallbackCandidate(Q_KROASAN, "pecivo", Q_KRAFNA) === true
);
assert(
  "krafna skips croissant marelica",
  shouldSkipTypeFallbackCandidate("Croissant marelica 80 g", "pecivo", Q_KRAFNA_MAR) === true
);
assert(
  "krafna skips žemlja 60g",
  shouldSkipTypeFallbackCandidate("PECIVO KIFLA 60g", "pecivo", Q_KRAFNA_MAR) === true
);
assert("krafna query not skipped", shouldSkipTypeFallbackQuery(Q_KRAFNA) === false);

assert(
  "croissant keeps croissant",
  shouldSkipTypeFallbackCandidate("CROISSANT CHOCO 50 G MILKA", "pecivo", Q_CROISSANT) === false
);
assert(
  "croissant skips žemlja 75g",
  shouldSkipTypeFallbackCandidate(Q_PECIVO, "pecivo", Q_CROISSANT) === true
);
assert(
  "croissant skips donut choco",
  shouldSkipTypeFallbackCandidate("JAFFA KOLAČ DONUT CHOCO 75 g", "pecivo", Q_CROISSANT) === true
);
assert(
  "croissant skips slano pecivo",
  shouldSkipTypeFallbackCandidate("Elephant Pecivo slano XXL 300g vg.", "pecivo", "CROISSANT BAULI CREMA 300g") === true
);
assert("croissant query not skipped", shouldSkipTypeFallbackQuery(Q_CROISSANT) === false);

assert(
  "generic pecivo skips croissant",
  shouldSkipTypeFallbackCandidate(Q_CROISSANT, "pecivo", Q_PECIVO) === true
);
assert(
  "generic pecivo skips krafna",
  shouldSkipTypeFallbackCandidate(Q_KRAFNA, "pecivo", Q_PECIVO) === true
);
assert(
  "generic pecivo keeps žemlja",
  shouldSkipTypeFallbackCandidate("BO Pecivo žemlja SUS, 75g", "pecivo", Q_PECIVO) === false
);

assert("mismatch krafna vs croissant", pecivoSubtypeMismatch(Q_KRAFNA, Q_CROISSANT) === true);
assert("mismatch croissant vs krafna", pecivoSubtypeMismatch(Q_CROISSANT, Q_KRAFNA) === true);
assert("same croissant ok", pecivoSubtypeMismatch(Q_CROISSANT, Q_KROASAN) === false);
}

// --- riza ---
{
const Q_BIJELA = "RIZA BIJELA DUGOZRNO 950 G OHO!";
const Q_RIBE = "RIŽA BIJELA RIBE 1kg";
const Q_ARBORIO = "RIŽA ARBORIO 1kg SCOTTI";
const Q_CARNAROLI = "RIŽA CARNAROLI 1 kg SCOTTI";
const Q_BASMATI = "RIŽA BASMATI 1kg";
const Q_ENCIAN_SMEDA = "RIŽA ENCIAN SMEĐA VAKUM 1 kg";
const Q_JASMIN = "Jasmin riža";
const Q_ORIGINARIO = "Riža okruglog zrna Originario";

assert("arborio word", isRizaArborioProduct(Q_ARBORIO) === true);
assert("carnaroli", isRizaArborioProduct(Q_CARNAROLI) === true);
assert("bijela not arborio", isRizaArborioProduct(Q_BIJELA) === false);
assert("originario not arborio", isRizaArborioProduct(Q_ORIGINARIO) === false);
assert("risotti not arborio", isRizaArborioProduct("RIŽA BLOND RISOTTI 1kg GAL") === false);

assert("basmati word", isRizaBasmatiProduct(Q_BASMATI) === true);
assert("bijela not basmati", isRizaBasmatiProduct(Q_BIJELA) === false);
assert("basmati bijela dugog zrna", isRizaBasmatiProduct("RIŽA BASMATI BIJELA DUGOGA ZRNA 1kg RIO-PAK") === true);

assert(
  "bijela skips arborio",
  shouldSkipTypeFallbackCandidate(Q_ARBORIO, "riza", Q_BIJELA) === true
);
assert(
  "bijela skips carnaroli",
  shouldSkipTypeFallbackCandidate(Q_CARNAROLI, "riza", "RIŽA SCOTTI EXTRA 1 kg") === true
);
assert(
  "bijela skips basmati",
  shouldSkipTypeFallbackCandidate("RIŽA BASMATI BIJELA DUGOGA ZRNA 1kg RIO-PAK", "riza", Q_BIJELA) === true
);
assert(
  "bijela keeps bijela",
  shouldSkipTypeFallbackCandidate(Q_RIBE, "riza", Q_BIJELA) === false
);
assert(
  "bijela keeps smeđa leftover",
  shouldSkipTypeFallbackCandidate(Q_ENCIAN_SMEDA, "riza", Q_BIJELA) === false
);
assert(
  "bijela keeps jasmin leftover",
  shouldSkipTypeFallbackCandidate(Q_JASMIN, "riza", Q_RIBE) === false
);
assert(
  "bijela keeps originario leftover",
  shouldSkipTypeFallbackCandidate(Q_ORIGINARIO, "riza", Q_RIBE) === false
);
assert("bijela query not skipped", shouldSkipTypeFallbackQuery(Q_BIJELA) === false);

assert(
  "arborio keeps arborio",
  shouldSkipTypeFallbackCandidate("RIŽA DESPAR ARBORIO 1 kg", "riza", Q_ARBORIO) === false
);
assert(
  "arborio keeps carnaroli",
  shouldSkipTypeFallbackCandidate(Q_CARNAROLI, "riza", Q_ARBORIO) === false
);
assert(
  "arborio skips bijela",
  shouldSkipTypeFallbackCandidate("RIŽA DUGO ZRNO 1kg", "riza", Q_ARBORIO) === true
);
assert(
  "arborio skips basmati",
  shouldSkipTypeFallbackCandidate(Q_BASMATI, "riza", Q_ARBORIO) === true
);

assert(
  "basmati keeps basmati",
  shouldSkipTypeFallbackCandidate("RIŽA S-BUDGET BASMATI 1 kg", "riza", Q_BASMATI) === false
);
assert(
  "basmati skips bijela",
  shouldSkipTypeFallbackCandidate("RIŽA DUGO ZRNO 1kg", "riza", Q_BASMATI) === true
);
assert(
  "basmati skips arborio",
  shouldSkipTypeFallbackCandidate(Q_ARBORIO, "riza", Q_BASMATI) === true
);

assert("mismatch bijela vs arborio", rizaSubtypeMismatch(Q_BIJELA, Q_ARBORIO) === true);
assert("same basmati ok", rizaSubtypeMismatch(Q_BASMATI, "Basmati riža") === false);
}

// --- secer ---
{
const Q_KRISTAL = "ŠEĆER KRISTAL 1kg VIROVITICA";
const Q_KIARA = "Kiara Kristal šećer 1kg";
const Q_SMEDI = "ŠEĆER SMEĐI GOLD 1kg BILLINGTON";
const Q_PRAH = "ŠEĆER U PRAHU 500g FRANCK";
const Q_ZELIR = "Wiener Želirni šećer 1:1 1kg";
const Q_DIAMANT = "ŠEĆER 1 kg DIAMANT";
const Q_KOLACIC = "ŠEĆER MOJ KOLAČIĆ 1 kg";
const Q_VANILIN = "Dolcela Vanilin šećer";

assert("smeđi word", isSecerSmediProduct(Q_SMEDI) === true);
assert("demerara", isSecerSmediProduct("ŠEĆER SMEĐI 1 kg XXL DEMERARA") === true);
assert("molasses", isSecerSmediProduct("ŠEĆER SMEĐI MOLASSESENCIAN 500 g") === true);
assert("kristal not smeđi", isSecerSmediProduct(Q_KRISTAL) === false);

assert("prah word", isSecerPrahProduct(Q_PRAH) === true);
assert("mljeveni", isSecerPrahProduct("ŠEĆER MLJEVENI 500 g ŠAFRAM") === true);
assert("kristal not prah", isSecerPrahProduct(Q_KRISTAL) === false);

assert("želirni", isSecerZelirProduct(Q_ZELIR) === true);
assert("zelir ascii", isSecerZelirProduct("ŠEĆER ZELIRNI EXTRA 2:1") === true);
assert("kristal not želirni", isSecerZelirProduct(Q_KRISTAL) === false);
assert("vanilin not želirni", isSecerZelirProduct(Q_VANILIN) === false);

assert(
  "kristal skips smeđi",
  shouldSkipTypeFallbackCandidate(Q_SMEDI, "secer", Q_KRISTAL) === true
);
assert(
  "kristal skips prah",
  shouldSkipTypeFallbackCandidate(Q_PRAH, "secer", Q_KIARA) === true
);
assert(
  "kristal skips želirni",
  shouldSkipTypeFallbackCandidate(Q_ZELIR, "secer", Q_KRISTAL) === true
);
assert(
  "kristal skips mljeveni",
  shouldSkipTypeFallbackCandidate("ŠEĆER MLJEVENI 500 g ŠAFRAM", "secer", Q_KIARA) === true
);
assert(
  "kristal keeps kristal",
  shouldSkipTypeFallbackCandidate("ŠEĆER KRISTAL S-BUDGET 1 kg", "secer", Q_KRISTAL) === false
);
assert(
  "kristal keeps Diamant leftover",
  shouldSkipTypeFallbackCandidate(Q_DIAMANT, "secer", Q_KRISTAL) === false
);
assert(
  "kristal keeps Moj kolačić leftover",
  shouldSkipTypeFallbackCandidate(Q_KOLACIC, "secer", Q_KIARA) === false
);
assert(
  "kristal keeps vanilin leftover",
  shouldSkipTypeFallbackCandidate(Q_VANILIN, "secer", Q_KRISTAL) === false
);
assert("kristal query not skipped", shouldSkipTypeFallbackQuery(Q_KRISTAL) === false);

assert(
  "smeđi keeps smeđi",
  shouldSkipTypeFallbackCandidate("Šećer smeđi 500g", "secer", Q_SMEDI) === false
);
assert(
  "smeđi skips kristal",
  shouldSkipTypeFallbackCandidate(Q_KRISTAL, "secer", Q_SMEDI) === true
);
assert(
  "smeđi skips prah",
  shouldSkipTypeFallbackCandidate(Q_PRAH, "secer", Q_SMEDI) === true
);
assert(
  "smeđi skips Diamant leftover",
  shouldSkipTypeFallbackCandidate(Q_DIAMANT, "secer", Q_SMEDI) === true
);

assert(
  "prah keeps prah",
  shouldSkipTypeFallbackCandidate("Agragold Šećer u prahu 500g", "secer", Q_PRAH) === false
);
assert(
  "prah skips kristal",
  shouldSkipTypeFallbackCandidate(Q_KIARA, "secer", Q_PRAH) === true
);
assert(
  "prah skips smeđi",
  shouldSkipTypeFallbackCandidate(Q_SMEDI, "secer", Q_PRAH) === true
);

assert(
  "želirni keeps želirni",
  shouldSkipTypeFallbackCandidate("Dr.Oetker Šećer želirni extra 2:1 500g", "secer", Q_ZELIR) === false
);
assert(
  "želirni skips kristal",
  shouldSkipTypeFallbackCandidate(Q_KRISTAL, "secer", Q_ZELIR) === true
);

assert("mismatch kristal vs želirni", secerSubtypeMismatch(Q_KRISTAL, Q_ZELIR) === true);
assert("same smeđi ok", secerSubtypeMismatch(Q_SMEDI, "Smeđi šećer") === false);
}

// --- sir ---
{
const Q_GOUDA = "SIR POLUTV GOUDA MAP 150G VINDIJA";
const Q_EDAM = "SIR EDAMAC REZANI SPAR 150 g";
const Q_MOZZ = "MOZZARELLA MINI S-BUDGE.125 g";
const Q_TOPLJ = "SIR TOPLJENI 140 g T!";
const Q_FETA = "SIR FETA GRČKA DESPAR 200 g";

assert("mozz mini", isMozzarellaProduct(Q_MOZZ) === true);
assert("mozz light", isMozzarellaProduct("Mozzarella light") === true);
assert("mozz kugla", isMozzarellaProduct("K-Classic mozzarella kugla light 125 g") === true);
assert("gouda not mozz", isMozzarellaProduct(Q_GOUDA) === false);

assert("topljeni classic", isTopljeniSirProduct(Q_TOPLJ) === true);
assert("topljeni list cheddar", isTopljeniSirProduct("SIR TOPLJ LIST CHEDDAR 150G DUKAT") === true);
assert("gouda not topljeni", isTopljeniSirProduct(Q_GOUDA) === false);

assert("svjezi krem", isSvjeziMekiSirProduct("ABC Svježi krem sir Classic, 100g") === true);
assert("svjezi without diacritic", isSvjeziMekiSirProduct("SIR SVJEZI ZAGREBAČKI MAXI 750g") === true);
assert("zrnati", isSvjeziMekiSirProduct("SIR SVJEŽI ZRNATI BEZ LAK.PROT.150g") === true);
assert("feta is svjezi", isSvjeziMekiSirProduct(Q_FETA) === true);
assert("mozz is not svjezi", isSvjeziMekiSirProduct(Q_MOZZ) === false);
assert("topljeni is not svjezi", isSvjeziMekiSirProduct(Q_TOPLJ) === false);

assert("hard gouda", queryWantsNaturalHardCheese(Q_GOUDA) === true);
assert("hard edamac", queryWantsNaturalHardCheese(Q_EDAM) === true);
assert("topljeni cheddar not hard query", queryWantsNaturalHardCheese("SIR TOPLJ LIST CHEDDAR 150G DUKAT") === false);
assert("mozz not hard query", queryWantsNaturalHardCheese(Q_MOZZ) === false);

assert(
  "gouda keeps gouda",
  shouldSkipTypeFallbackCandidate("President Gouda sir 400 g", "sir", Q_GOUDA) === false
);
assert(
  "gouda keeps edamac",
  shouldSkipTypeFallbackCandidate(Q_EDAM, "sir", Q_GOUDA) === false
);
assert(
  "gouda keeps trapist",
  shouldSkipTypeFallbackCandidate("SIR TRAPIST 300 g DELICATO", "sir", Q_GOUDA) === false
);
assert(
  "gouda skips krem",
  shouldSkipTypeFallbackCandidate("ABC Svježi krem sir Classic, 100g", "sir", Q_GOUDA) === true
);
assert(
  "gouda skips svjezi",
  shouldSkipTypeFallbackCandidate("SIR SVJEZI ZAGREBAČKI MAXI 750g", "sir", Q_EDAM) === true
);
assert(
  "gouda skips mozzarella",
  shouldSkipTypeFallbackCandidate(Q_MOZZ, "sir", Q_GOUDA) === true
);
assert(
  "gouda skips topljeni",
  shouldSkipTypeFallbackCandidate(Q_TOPLJ, "sir", Q_GOUDA) === true
);

assert(
  "mozz keeps mozz",
  shouldSkipTypeFallbackCandidate("K-Classic mozzarella kugla light 125 g", "sir", Q_MOZZ) === false
);
assert(
  "mozz skips krem",
  shouldSkipTypeFallbackCandidate("ABC Svježi krem sir Classic, 100g", "sir", Q_MOZZ) === true
);
assert(
  "mozz skips topljeni",
  shouldSkipTypeFallbackCandidate(Q_TOPLJ, "sir", Q_MOZZ) === true
);
assert(
  "mozz skips gouda",
  shouldSkipTypeFallbackCandidate(Q_GOUDA, "sir", Q_MOZZ) === true
);
assert(
  "mozz skips kokice",
  shouldSkipTypeFallbackCandidate("KLC.Kokice za mikrovalnu sir 100 g", "sir", Q_MOZZ) === true
);

assert(
  "topljeni keeps topljeni",
  shouldSkipTypeFallbackCandidate("SIR TOPLJENI HAPPY COW 140 g", "sir", Q_TOPLJ) === false
);
assert(
  "topljeni skips krem",
  shouldSkipTypeFallbackCandidate("ABC Svježi krem sir Classic, 100g", "sir", Q_TOPLJ) === true
);
assert(
  "topljeni skips mozzarella",
  shouldSkipTypeFallbackCandidate(Q_MOZZ, "sir", Q_TOPLJ) === true
);
assert(
  "topljeni skips gouda",
  shouldSkipTypeFallbackCandidate(Q_GOUDA, "sir", Q_TOPLJ) === true
);

assert(
  "feta keeps krem",
  shouldSkipTypeFallbackCandidate("ABC Svježi krem sir Classic, 100g", "sir", Q_FETA) === false
);
assert(
  "feta keeps feta",
  shouldSkipTypeFallbackCandidate("SIR FETA 150 g SALAKIS", "sir", Q_FETA) === false
);
assert(
  "feta skips mozzarella",
  shouldSkipTypeFallbackCandidate(Q_MOZZ, "sir", Q_FETA) === true
);
assert(
  "feta skips topljeni",
  shouldSkipTypeFallbackCandidate(Q_TOPLJ, "sir", Q_FETA) === true
);

assert("mozz query not skipped", shouldSkipTypeFallbackQuery(Q_MOZZ) === false);
assert("topljeni query not skipped", shouldSkipTypeFallbackQuery(Q_TOPLJ) === false);
assert(
  "mismatch mozz vs gouda",
  sirSubtypeMismatch(Q_MOZZ, Q_GOUDA) === true
);
}

// --- sok ---
{
const Q_NARANCA = "SOK NARANČA 100% MINUTE 1L";
const Q_PFANNER = "Pfanner Sok naranča 100% 1 l elopak";
const Q_NEKTAR = "NEKTAR MOJ DAN NARANČA 1L";
const Q_NEKTAR_JAGODA = "NEKTAR JAGODA 1l";
const Q_SMOOTHIE = "SMOOTHIE ANANAS 200 ml HELLO";
const Q_SMOOTHIE_MANGO = "SMOOTHIE MANGO MARAKUJA CHIA 250ML";
const Q_BOROVNICA = "SOK BOROVNICA 20% 1 L PFANNER";
const Q_JABUKA = "Sok od jabuke 100%";
const Q_DANA = "SOK NARANČA 100% 1 L DANA";
const Q_PAGO = "SOK PAGO ANANAS NEKTAR 0,2 L BOCA KAFIC";
const Q_JUICY = "SOK JUICY 100% JAGODA 1 l";
const Q_ISO = "SOK VINDI ISO SPORT 4X1 L";
const Q_LIMUNADA = "SOK MACE ĐUMBIR LIMUNADA 250ml";
const Q_TROKO = "SOK TROKO FRESH MANGO SA SJEMENKAMA BOSILJKA 0,29 L";
const Q_SOK_NEKTAR = "SOK NEKTAR NARANČA MARASKA 1 l";

assert("smoothie word", isSokSmoothieProduct(Q_SMOOTHIE) === true);
assert("naranča not smoothie", isSokSmoothieProduct(Q_NARANCA) === false);

assert("nektar word", isSokNektarProduct(Q_NEKTAR) === true);
assert("sok nektar compound", isSokNektarProduct(Q_SOK_NEKTAR) === true);
assert("100% not nektar", isSokNektarProduct(Q_NARANCA) === false);
assert("jabuka not nektar", isSokNektarProduct(Q_JABUKA) === false);

assert(
  "naranča skips nektar",
  shouldSkipTypeFallbackCandidate(Q_NEKTAR, "sok", Q_PFANNER) === true
);
assert(
  "naranča skips sok nektar",
  shouldSkipTypeFallbackCandidate(Q_SOK_NEKTAR, "sok", Q_NARANCA) === true
);
assert(
  "naranča skips smoothie",
  shouldSkipTypeFallbackCandidate(Q_SMOOTHIE, "sok", Q_NARANCA) === true
);
assert(
  "naranča keeps naranča",
  shouldSkipTypeFallbackCandidate(Q_DANA, "sok", Q_NARANCA) === false
);
assert(
  "naranča keeps borovnica leftover",
  shouldSkipTypeFallbackCandidate(Q_BOROVNICA, "sok", Q_PFANNER) === false
);
assert(
  "naranča keeps jabuka leftover",
  shouldSkipTypeFallbackCandidate(Q_JABUKA, "sok", Q_NARANCA) === false
);
assert("naranča query not skipped", shouldSkipTypeFallbackQuery(Q_NARANCA) === false);

assert(
  "nektar keeps nektar",
  shouldSkipTypeFallbackCandidate("NEKTAR VINDIJA NARANČA 1 L", "sok", Q_NEKTAR) === false
);
assert(
  "nektar skips 100% naranča",
  shouldSkipTypeFallbackCandidate(Q_NARANCA, "sok", Q_NEKTAR) === true
);
assert(
  "nektar skips juicy 100% jagoda",
  shouldSkipTypeFallbackCandidate(Q_JUICY, "sok", Q_NEKTAR_JAGODA) === true
);
assert(
  "nektar skips iso sport",
  shouldSkipTypeFallbackCandidate(Q_ISO, "sok", "Vindi Nektar premium crni ribiz 1L") === true
);
assert(
  "nektar skips smoothie",
  shouldSkipTypeFallbackCandidate(Q_SMOOTHIE, "sok", Q_NEKTAR) === true
);
assert(
  "nektar keeps other nektar leftover flavor",
  shouldSkipTypeFallbackCandidate("VOĆ. NEKTAR VINDIJA VIŠNJA 1 L", "sok", Q_NEKTAR_JAGODA) === false
);

assert(
  "smoothie keeps smoothie",
  shouldSkipTypeFallbackCandidate(Q_SMOOTHIE_MANGO, "sok", Q_SMOOTHIE) === false
);
assert(
  "smoothie skips nektar pago",
  shouldSkipTypeFallbackCandidate(Q_PAGO, "sok", Q_SMOOTHIE) === true
);
assert(
  "smoothie skips sok troko",
  shouldSkipTypeFallbackCandidate(Q_TROKO, "sok", Q_SMOOTHIE_MANGO) === true
);
assert(
  "smoothie skips limunada",
  shouldSkipTypeFallbackCandidate(Q_LIMUNADA, "sok", "Smoothie 250ml SK13") === true
);
assert("smoothie query not skipped", shouldSkipTypeFallbackQuery(Q_SMOOTHIE) === false);

assert("mismatch naranča vs nektar", sokSubtypeMismatch(Q_NARANCA, Q_NEKTAR) === true);
assert("same smoothie ok", sokSubtypeMismatch(Q_SMOOTHIE, Q_SMOOTHIE_MANGO) === false);
assert("other typeKey ignores sok", shouldSkipTypeFallbackCandidate(Q_NEKTAR, "caj", Q_NARANCA) === false);
}

// --- sunka ---
{
const Q_PRSUT = "PRŠUT 11 MJ. 100g";
const Q_PRSUT_500 = "PRŠUT K PLUS 500G NAR MAXX";
const Q_SLANINA = "SLANINA ZA PEČENJE 150g";
const Q_SLANINA_400 = "Belje Slanina Baranjska cca 400g";
const Q_SUNKA = "ŠUNKA NAREZAK 150g GAVRILOVIĆ";
const Q_SUNKA_KUH = "ŠUNKA KUHANA NAR 125g MA PIK VRBOVEC";

assert("pršut word", isSunkaPrsutProduct(Q_PRSUT) === true);
assert("prsut ascii", isSunkaPrsutProduct("PRSUT DALMATINSKI 100g") === true);
assert("prosciutto", isSunkaPrsutProduct("PROSCIUTTO CRUDO 80g") === true);
assert("šunka not pršut", isSunkaPrsutProduct(Q_SUNKA) === false);
assert("slanina not pršut", isSunkaPrsutProduct(Q_SLANINA) === false);

assert("slanina word", isSunkaSlaninaProduct(Q_SLANINA) === true);
assert("pršut not slanina", isSunkaSlaninaProduct(Q_PRSUT) === false);
assert("šunka not slanina", isSunkaSlaninaProduct(Q_SUNKA) === false);

assert(
  "pršut keeps pršut",
  shouldSkipTypeFallbackCandidate("PRŠUT NARESCI 500g", "sunka", Q_PRSUT_500) === false
);
assert(
  "pršut skips kuhana šunka 500g",
  shouldSkipTypeFallbackCandidate("Mijukić Šunka Dalmatinska suha 500g", "sunka", Q_PRSUT_500) === true
);
assert(
  "pršut skips šunka 100g",
  shouldSkipTypeFallbackCandidate("ŠUNKA WEIN SCHWARZ 100g NAR", "sunka", Q_PRSUT) === true
);
assert(
  "pršut skips pureća 100g",
  shouldSkipTypeFallbackCandidate("Perutnina S&F Pureća šunka dimljena 100g", "sunka", Q_PRSUT) === true
);
assert(
  "pršut skips buđola 100g",
  shouldSkipTypeFallbackCandidate("BUĐOLA 100G", "sunka", Q_PRSUT) === true
);
assert(
  "pršut skips slanina",
  shouldSkipTypeFallbackCandidate(Q_SLANINA, "sunka", Q_PRSUT) === true
);
assert("pršut query not skipped", shouldSkipTypeFallbackQuery(Q_PRSUT) === false);

assert(
  "slanina keeps slanina",
  shouldSkipTypeFallbackCandidate("SLANINA NARESCI 90g DOBRO", "sunka", Q_SLANINA) === false
);
assert(
  "slanina skips šunka 150g",
  shouldSkipTypeFallbackCandidate("PIK Fina Šunka, narezana, 150g", "sunka", Q_SLANINA) === true
);
assert(
  "slanina skips narezak 150g",
  shouldSkipTypeFallbackCandidate(Q_SUNKA, "sunka", Q_SLANINA) === true
);
assert(
  "slanina skips makaroni šunka 400g",
  shouldSkipTypeFallbackCandidate("MAKARONI ŠUNKA SIR 400G COME A CASA", "sunka", Q_SLANINA_400) === true
);
assert(
  "slanina skips pršut",
  shouldSkipTypeFallbackCandidate(Q_PRSUT, "sunka", Q_SLANINA) === true
);
assert("slanina query not skipped", shouldSkipTypeFallbackQuery(Q_SLANINA) === false);

assert(
  "generic šunka skips pršut",
  shouldSkipTypeFallbackCandidate(Q_PRSUT, "sunka", Q_SUNKA) === true
);
assert(
  "generic šunka skips slanina",
  shouldSkipTypeFallbackCandidate(Q_SLANINA, "sunka", Q_SUNKA) === true
);
assert(
  "generic šunka keeps šunka",
  shouldSkipTypeFallbackCandidate("PIK Šunka delikates narezak 150g", "sunka", Q_SUNKA) === false
);
assert(
  "generic šunka keeps kuhana",
  shouldSkipTypeFallbackCandidate(Q_SUNKA_KUH, "sunka", Q_SUNKA) === false
);

assert("mismatch pršut vs slanina", sunkaSubtypeMismatch(Q_PRSUT, Q_SLANINA) === true);
assert("mismatch slanina vs pršut", sunkaSubtypeMismatch(Q_SLANINA, Q_PRSUT) === true);
assert("same pršut ok", sunkaSubtypeMismatch(Q_PRSUT, Q_PRSUT_500) === false);
}

// --- tjestenina ---
{
const Q_NJOKI = "NJOKI 500g KARLA";
const Q_DRY = "TJESTENINA SPAR ŠPAGETE 500 g";
const Q_MLINCI = "MLINCI 500g KOGUTEX";
const Q_GENERIC = "Tjestenina 500g";

assert("is njoki karla", isNjokiProduct(Q_NJOKI) === true);
assert("is njoki bio", isNjokiProduct("Bio njoki") === true);
assert("is njoki gnocchi", isNjokiProduct("Gnocchi 500g") === true);
assert("is njoki svjezi", isNjokiProduct("SVJEŽI NJOKI BEZ GLUTENA 2x200g") === true);
assert("spaghetti is not njoki", isNjokiProduct(Q_DRY) === false);
assert("mlinci is not njoki", isNjokiProduct(Q_MLINCI) === false);

assert("nonDry lasagne", isNonDryPastaProduct("Lasagne od durum pšenice") === true);
assert("nonDry juha", isNonDryPastaProduct("JUHA KOKOŠJA S TJEST 60g") === true);
assert("nonDry gotovo", isNonDryPastaProduct("Gotova japanska tjestenina SK1") === true);
assert("nonDry punjena", isNonDryPastaProduct("Punjena tjestenina SK1") === true);
assert("njoki is not nonDry", isNonDryPastaProduct(Q_NJOKI) === false);
assert("punjeni njoki is nonDry", isNonDryPastaProduct("Punjeni njoki SK1") === true);

assert(
  "njoki keeps njoki",
  shouldSkipTypeFallbackCandidate("NJOKI 500g KARLA", "tjestenina", Q_NJOKI) === false
);
assert(
  "njoki keeps bio njoki",
  shouldSkipTypeFallbackCandidate("Bio njoki", "tjestenina", Q_NJOKI) === false
);
assert(
  "njoki keeps gnocchi",
  shouldSkipTypeFallbackCandidate("Gnocchi 500g", "tjestenina", Q_NJOKI) === false
);
assert(
  "njoki skips spaghetti",
  shouldSkipTypeFallbackCandidate("Barilla Tjestenina Spaghetti, 1kg", "tjestenina", Q_NJOKI) === true
);
assert(
  "njoki skips mlinci",
  shouldSkipTypeFallbackCandidate(Q_MLINCI, "tjestenina", Q_NJOKI) === true
);
assert(
  "njoki skips slova",
  shouldSkipTypeFallbackCandidate("TJESTENINA SLOVA S JAJIMA 500g PIK RIJEK", "tjestenina", Q_NJOKI) ===
    true
);
assert(
  "njoki skips peppa",
  shouldSkipTypeFallbackCandidate("TJEST PEPPA PIG 400 g MELISSA", "tjestenina", Q_NJOKI) === true
);
assert(
  "njoki skips punjeni njoki",
  shouldSkipTypeFallbackCandidate("Punjeni njoki SK1", "tjestenina", Q_NJOKI) === true
);
assert(
  "njoki skips lasagne",
  shouldSkipTypeFallbackCandidate("Lasagne od durum pšenice", "tjestenina", Q_NJOKI) === true
);

assert(
  "dry skips njoki",
  shouldSkipTypeFallbackCandidate(Q_NJOKI, "tjestenina", Q_DRY) === true
);
assert(
  "dry keeps spaghetti",
  shouldSkipTypeFallbackCandidate("Barilla Tjestenina Spaghetti, 1kg", "tjestenina", Q_DRY) === false
);
assert(
  "generic skips njoki",
  shouldSkipTypeFallbackCandidate("Bio njoki", "tjestenina", Q_GENERIC) === true
);
assert(
  "generic keeps ostalo",
  shouldSkipTypeFallbackCandidate("TJESTENINA SLOVA S JAJIMA 500g PIK RIJEK", "tjestenina", Q_GENERIC) ===
    false
);
assert(
  "mlinci keeps mlinci",
  shouldSkipTypeFallbackCandidate("MLINCI S JAJIMA S BUDGET 250g", "tjestenina", Q_MLINCI) === false
);
assert(
  "mlinci skips spaghetti",
  shouldSkipTypeFallbackCandidate("Barilla Tjestenina Spaghetti, 1kg", "tjestenina", Q_MLINCI) === true
);
assert(
  "mlinci skips njoki",
  shouldSkipTypeFallbackCandidate(Q_NJOKI, "tjestenina", Q_MLINCI) === true
);

assert("njoki query not skipped", shouldSkipTypeFallbackQuery(Q_NJOKI) === false);
assert(
  "mismatch helper njoki vs spaghetti",
  tjesteninaSubtypeMismatch(Q_NJOKI, "Barilla Tjestenina Spaghetti, 1kg") === true
);
assert(
  "mismatch helper njoki vs njoki",
  tjesteninaSubtypeMismatch(Q_NJOKI, "Bio njoki") === false
);
}

// --- vrhnje ---
{
const Q_COOK = "Meggle vrhnje za kuhanje 20% mm 200ml";
const Q_COOK_UHT = "VRHNJE ZA KUHANJE UHT 200ml";
const Q_WHIP = "VRHNJE ZA ŠLAG 36%MM 200ML VINDIJA";
const Q_SLATKO = "SLATKO VRHNJE 200 ML ZOTT STANIC";
const Q_KISELO = "KISELO VRHNJE 12% 180g";

assert("whip šlag", isVrhnjeWhipProduct(Q_WHIP) === true);
assert("whip slatko", isVrhnjeWhipProduct(Q_SLATKO) === true);
assert("whip pripravak", isVrhnjeWhipProduct("PRIPRAVAK ZA ŠLAG CREME PATISS 200ml") === true);
assert("whip patiss", isVrhnjeWhipProduct("Meggle Creme Patisserie vrhnje 25% 200ml") === true);
assert("cook not whip", isVrhnjeWhipProduct(Q_COOK) === false);
assert("kuh. abbr not whip", isVrhnjeWhipProduct("VRHNJE KUH. 500 ML BOCA VINDIJA") === false);
assert("kiselo not whip", isVrhnjeWhipProduct(Q_KISELO) === false);

assert(
  "cook keeps cook",
  shouldSkipTypeFallbackCandidate("VRHNJE ZA KUHANJE 200 ML Z'BREGOV", "vrhnje", Q_COOK) === false
);
assert(
  "cook keeps kuh. abbr",
  shouldSkipTypeFallbackCandidate("Dukat Vrhnje za kuh. 20%, 500g", "vrhnje", Q_COOK) === false
);
assert(
  "cook skips pripravak šlag",
  shouldSkipTypeFallbackCandidate("PRIPRAVAK ZA ŠLAG CREME PATISS 200ml", "vrhnje", Q_COOK) === true
);
assert(
  "cook skips patiss",
  shouldSkipTypeFallbackCandidate("Meggle Creme Patisserie vrhnje 25% 200ml", "vrhnje", Q_COOK_UHT) === true
);
assert(
  "cook leftover kiselo kept",
  shouldSkipTypeFallbackCandidate("VRHNJE KISELO 12% 900g DUKAT", "vrhnje", "VRHNJE ZA KUHANJE 1kg DUKAT") === false
);

assert(
  "whip keeps šlag",
  shouldSkipTypeFallbackCandidate("VRHNJE ZA ŠLAG 36% 0.5L VINDIJA", "vrhnje", Q_WHIP) === false
);
assert(
  "whip keeps slatko",
  shouldSkipTypeFallbackCandidate("Creme Patisserie slatko vrhnje 25 % 1 l", "vrhnje", Q_SLATKO) === false
);
assert(
  "whip skips kuhanje",
  shouldSkipTypeFallbackCandidate("VRHNJE ZA KUHANJE VINDIJA 500 ml", "vrhnje", Q_WHIP) === true
);
assert(
  "whip skips kuh. abbr",
  shouldSkipTypeFallbackCandidate("VRHNJE KUH. 500 ML BOCA VINDIJA", "vrhnje", Q_WHIP) === true
);
assert("whip query not skipped", shouldSkipTypeFallbackQuery(Q_WHIP) === false);

assert("mismatch cook vs whip", vrhnjeSubtypeMismatch(Q_COOK, Q_WHIP) === true);
assert("mismatch whip vs cook", vrhnjeSubtypeMismatch(Q_WHIP, Q_COOK) === true);
assert("same cook ok", vrhnjeSubtypeMismatch(Q_COOK, Q_COOK_UHT) === false);
}

{
  const Q_PUREE = "Fruit&go Pire od jabuke,banan., jag.100g";
  const Q_SANDWICH = "Sendvič piletina i ruko.140g";
  const Q_BATAK = "PILEĆI BATAK I ZAB. PODL. PIVKA 500 g";
  const Q_PRSA = "PILEĆA PRSA 400 g SLIM&FIT PERUTNINA";
  const Q_MINCE = "JUNETINA MLJEVENA 540 g PIK";
  const Q_PATTY = "JUNEĆA PLJESKAVICA LUK 450 g";
  const Q_CEVAPI = "ĆEVAPI JUNETINA SVINJETINA 500g";
  const Q_POTATO_PIRE = "KRUMPIR PIRE 500g";
  const Q_FILE = "Piletina file 500 g";

  assert("fruit puree query skipped", shouldSkipTypeFallbackQuery(Q_PUREE) === true);
  assert("potato pire without fruit not skipped", shouldSkipTypeFallbackQuery(Q_POTATO_PIRE) === false);
  assert("sandwich query skipped", shouldSkipTypeFallbackQuery(Q_SANDWICH) === true);
  assert(
    "batak vs only prsa is empty",
    preferMeatCutCandidates([{ name: Q_PRSA }], Q_BATAK, (c) => c.name).length === 0
  );
  assert(
    "file keeps prsa same cut group",
    preferMeatCutCandidates([{ name: Q_PRSA }], Q_FILE, (c) => c.name).length === 1
  );
  assert(
    "mince skips pljeskavica candidate",
    shouldSkipTypeFallbackCandidate(Q_PATTY, "meso_junetina", Q_MINCE) === true
  );
  assert("cevapi query skipped", shouldSkipTypeFallbackQuery(Q_CEVAPI) === true);
}

{
  const Q_GULAS_MEAL = "GULAŠ JUNETINA 500g";
  const Q_ZA_GULAS_SVIN = "SVINJETINA ZA GULAŠ 500g";
  const Q_ZA_GULAS_JUNE = "JUNETINA ZA GULAŠ";
  const Q_PAPRIKAS = "PAPRIKAŠ";

  assert("gulas junetina is ready meal", isReadyMealOrMeatProduct(Q_GULAS_MEAL) === true);
  assert("gulas junetina query skipped", shouldSkipTypeFallbackQuery(Q_GULAS_MEAL) === true);
  assert("svinjetina za gulas is not ready meal", isReadyMealOrMeatProduct(Q_ZA_GULAS_SVIN) === false);
  assert("svinjetina za gulas query not skipped", shouldSkipTypeFallbackQuery(Q_ZA_GULAS_SVIN) === false);
  assert("junetina za gulas is not ready meal", isReadyMealOrMeatProduct(Q_ZA_GULAS_JUNE) === false);
  assert("paprikas still ready meal", isReadyMealOrMeatProduct(Q_PAPRIKAS) === true);
}

await server.close();
if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\nAll passed.");
