# -*- coding: utf-8 -*-
"""
Generoi täysin lokalisoidut, maakohtaisesti eristetyt Nord Pool -sivustot (FI, SE, NO, DK, EE, LV, LT).
Jokaisella maalla on:
- Oma äidinkielinen käyttöliittymä, terminologia ja valuutta (snt/kWh, öre/kWh, øre/kWh, senti/kWh, centi/kWh, ct/kWh)
- Kaavio aivan sivun ylälaidassa heti yläpalkin alla ensimmäisenä elementtinä
- Oma paikallinen postinumeropohjainen siirtohintalaskuri (paikalliset verkkoyhtiöt, hinta-alueet SE1-SE4, NO1-NO5, DK1-DK2 ja paikalliset sähköverot)
- Ei yhtäkään ristiinlinkkiä tai kielivalikkoa muihin maihin
- Maakohtaiset geo-meta-tagit ja Schema.org areaServed -määritykset hakukoneille
"""

import json
import os

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

COUNTRY_LOCALES = {
    "se": {
        "lang": "sv-SE",
        "geoRegion": "SE",
        "countryName": "Sverige",
        "siteName": "Elmäklaren // SE-Spot",
        "brandKicker": "NORD POOL SE1–SE4",
        "brandSubtitle": "Spotpris på el timme för timme, 7-dygnsprognos och elnätsavgift via postnummer",
        "navChart": "Spotgraf",
        "navTable": "Timtabell",
        "navTransfer": "Elnätskalkylator",
        "navOptimizer": "Laststyrning (36 h)",
        "chartTitle": "Spotpris på el och 7-dygnsprognos (öre/kWh)",
        "hoverHint": "För muspekaren över en stapel för att se pris och sannolikt prisintervall",
        "legendCheap": "Lågt pris (< 35 öre/kWh)",
        "legendNorm": "Normalt (35–95 öre/kWh)",
        "legendHigh": "Högt pris (> 95 öre/kWh)",
        "legendRange": "Prognosens prisintervall (min–max öre/kWh)",
        "legendWind": "Svensk vindkraft (GW, streckad linje)",
        "scrollDownText": "Scrolla ned för timtabell, elnätskalkylator via postnummer och laststyrning",
        "tableHeading": "Timvis prisuppskattning och sannolikt prisintervall (24 h/dygn)",
        "colTime": "Klockslag (Timme)",
        "colSpot": "Spotpris (uppskattning / pris)",
        "colRange": "Sannolikt prisintervall",
        "colTotal": "Totalpris inkl. elnät & skatt",
        "colWeather": "Vindkraft och temperatur",
        "transferHeading": "Elnätskalkylator och totalt elpris via postnummer i Sverige",
        "transferLead": "Ange ditt 5-siffriga postnummer (t.ex. 11122 Stockholm, 41101 Göteborg, 21120 Malmö, 97231 Luleå) så identifieras ditt elområde (SE1–SE4), ditt lokala elnätsbolag och energiskatt automatiskt.",
        "postalLabel": "Postnummer eller ort",
        "postalPlaceholder": "11122, 41101, 21120, 97231...",
        "setBtn": "Välj",
        "tariffLabel": "Elnätstariff",
        "tariffGeneral": "Enkeltariff",
        "tariffTime": "Tidstariff (Dag / Natt)",
        "marginLabel": "Elhandlares påslag (öre/kWh)",
        "vatLabel": "Momssats",
        "vatIncl": "Inkl. moms 25 %",
        "vatZero": "Exkl. moms (0 %)",
        "unit": "öre/kWh",
        "approxPrefix": "ca ",
        "rangePrefix": "Prisintervall",
        "fixedText": "Publicerat fast pris",
        "defaultPostal": "11122",
        "defaultCity": "Stockholm (SE3)",
        "taxInclVat": 53.50,
        "dsos": [
            {"id": "ellevio", "name": "Ellevio AB (Stockholm / Mellansverige — SE3)", "gen": 32.5, "day": 44.0, "night": 19.5, "zone": "SE3", "postals": ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "65", "66", "67", "68", "69", "82"]},
            {"id": "eon_se4", "name": "E.ON Energidistribution (Södra Sverige — SE4)", "gen": 41.2, "day": 54.0, "night": 24.5, "zone": "SE4", "postals": ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "35", "36", "37", "38", "39", "57"]},
            {"id": "vattenfall_se3", "name": "Vattenfall Eldistribution (Uppsala / Östergötland / Väst — SE3)", "gen": 36.8, "day": 49.5, "night": 21.0, "zone": "SE3", "postals": ["58", "59", "60", "61", "62", "63", "64", "74", "75", "76", "45", "46", "47"]},
            {"id": "goteborg", "name": "Göteborg Energi Nät AB (Göteborg — SE3)", "gen": 26.4, "day": 35.0, "night": 16.0, "zone": "SE3", "postals": ["40", "41", "42", "43", "44"]},
            {"id": "vattenfall_se1", "name": "Vattenfall / Luleå Energi Elnät (Norra Norrland — SE1)", "gen": 28.0, "day": 36.0, "night": 16.5, "zone": "SE1", "postals": ["95", "96", "97", "98"]},
            {"id": "sundsvall_se2", "name": "Sundsvalls Elnät / Jämtkraft (Södra Norrland — SE2)", "gen": 29.5, "day": 38.0, "night": 17.5, "zone": "SE2", "postals": ["83", "84", "85", "86", "87", "88", "89", "90", "91", "92", "93", "94"]},
        ],
    },
    "no": {
        "lang": "nb-NO",
        "geoRegion": "NO",
        "countryName": "Norge",
        "siteName": "Strømmåleren // NO-Spot",
        "brandKicker": "NORD POOL NO1–NO5",
        "brandSubtitle": "Strømpris time for time, 7-dagers prognose og nettleiekalkulator med postnummer",
        "navChart": "Strømgraf",
        "navTable": "Timetabell",
        "navTransfer": "Nettleiekalkulator",
        "navOptimizer": "Smartlading (36 t)",
        "chartTitle": "Spotpris på strøm og 7-dagers prognose (øre/kWh)",
        "hoverHint": "Hold musepekeren over en stolpe for å se pris og sannsynlig prisintervall",
        "legendCheap": "Lav pris (< 35 øre/kWh)",
        "legendNorm": "Normal (35–95 øre/kWh)",
        "legendHigh": "Høy pris (> 95 øre/kWh)",
        "legendRange": "Prognosens prisintervall (min–maks øre/kWh)",
        "legendWind": "Vind- og vannkraftindeks (GW, stiplet linje)",
        "scrollDownText": "Rull ned for timetabell, nettleiekalkulator med postnummer og belastningsstyring",
        "tableHeading": "Timevis prisanslag og sannsynlig prisintervall (24 t/døgn)",
        "colTime": "Klokkeslett (Time)",
        "colSpot": "Spotpris (anslag / pris)",
        "colRange": "Sannsynlig prisintervall",
        "colTotal": "Totalpris inkl. nettleie & avgift",
        "colWeather": "Vindkraft og temperatur",
        "transferHeading": "Nettleiekalkulator og total strømpris via postnummer i Norge",
        "transferLead": "Skriv inn ditt 4-sifrede postnummer (f.eks. 0150 Oslo, 5003 Bergen, 7010 Trondheim, 4611 Kristiansand, 9008 Tromsø) for å hente riktig prisområde (NO1–NO5) og nettselskap automatisk.",
        "postalLabel": "Postnummer eller sted",
        "postalPlaceholder": "0150, 5003, 7010, 9008...",
        "setBtn": "Velg",
        "tariffLabel": "Nettleiemodell",
        "tariffGeneral": "Standard energiledd",
        "tariffTime": "Dag / Natt & Helg",
        "marginLabel": "Strømleverandørens påslag (øre/kWh)",
        "vatLabel": "Merverdiavgift (mva)",
        "vatIncl": "Inkl. mva 25 % (0 % i NO4)",
        "vatZero": "Eks. mva (0 %)",
        "unit": "øre/kWh",
        "approxPrefix": "ca. ",
        "rangePrefix": "Prisintervall",
        "fixedText": "Publisert fast pris",
        "defaultPostal": "0150",
        "defaultCity": "Oslo (NO1)",
        "taxInclVat": 21.80,
        "dsos": [
            {"id": "elvia", "name": "Elvia AS (Oslo, Innlandet, Akershus & Østfold — NO1)", "gen": 38.5, "day": 44.2, "night": 31.0, "zone": "NO1", "postals": ["0", "1", "2"]},
            {"id": "lede_glitre", "name": "Glitre Nett / Lede / Lyse Elnett (Sør-Norge — NO2)", "gen": 41.0, "day": 47.5, "night": 33.5, "zone": "NO2", "postals": ["3", "4"]},
            {"id": "bkk", "name": "BKK AS (Bergen & Vestland — NO5)", "gen": 39.2, "day": 45.8, "night": 30.5, "zone": "NO5", "postals": ["5"]},
            {"id": "tensio", "name": "Tensio / Linja (Midt-Norge & Trøndelag — NO3)", "gen": 36.4, "day": 42.0, "night": 28.5, "zone": "NO3", "postals": ["6", "7"]},
            {"id": "arva", "name": "Arva AS / Nordlandsnett (Nord-Norge — NO4, fritatt mva)", "gen": 29.0, "day": 33.0, "night": 23.0, "zone": "NO4", "postals": ["8", "9"]},
        ],
    },
    "dk": {
        "lang": "da-DK",
        "geoRegion": "DK",
        "countryName": "Danmark",
        "siteName": "Elmåleren // DK-Spot",
        "brandKicker": "NORD POOL DK1 & DK2",
        "brandSubtitle": "Elpris time for time, 7-døgns prognose og nettarifberegner med postnummer",
        "navChart": "Elprisgraf",
        "navTable": "Timetabel",
        "navTransfer": "Nettarifberegner",
        "navOptimizer": "Forbrugsstyring (36 t)",
        "chartTitle": "Spotpris på el og 7-døgns prognose (øre/kWh)",
        "hoverHint": "Hold musen over en søjle for at se pris og sandsynligt prisinterval",
        "legendCheap": "Lav elpris (< 25 øre/kWh)",
        "legendNorm": "Normal (25–65 øre/kWh)",
        "legendHigh": "Høj elpris (> 65 øre/kWh)",
        "legendRange": "Prognosens prisinterval (min–maks øre/kWh)",
        "legendWind": "Dansk vindkraft (GW, stiplet linje)",
        "scrollDownText": "Rul ned for timetabel, nettarifberegner via postnummer (Tarifmodel 3.0) og forbrugsstyring",
        "tableHeading": "Timevis prisestimat og sandsynligt prisinterval (24 t/døgn)",
        "colTime": "Klokkeslæt (Time)",
        "colSpot": "Spotpris (estimat / pris)",
        "colRange": "Sandsynligt prisinterval",
        "colTotal": "Samlet pris inkl. transport & elafgift",
        "colWeather": "Vindkraft og temperatur",
        "transferHeading": "Nettarifberegner (Tarifmodel 3.0) og samlet elpris via postnummer i Danmark",
        "transferLead": "Indtast dit 4-cifrede postnummer (f.eks. 1050 København, 8000 Aarhus, 5000 Odense, 9000 Aalborg) for automatisk at finde dit prisområde (DK1/DK2) og dit lokale netselskab.",
        "postalLabel": "Postnummer eller by",
        "postalPlaceholder": "1050, 8000, 5000, 9000...",
        "setBtn": "Vælg",
        "tariffLabel": "Nettarif (Tarifmodel 3.0)",
        "tariffGeneral": "Gennemsnitstarif",
        "tariffTime": "Tidsdifferentieret (Lav / Høj / Spids)",
        "marginLabel": "Elselskabets tillæg (øre/kWh)",
        "vatLabel": "Momssats",
        "vatIncl": "Inkl. moms 25 %",
        "vatZero": "Ekskl. moms (0 %)",
        "unit": "øre/kWh",
        "approxPrefix": "ca. ",
        "rangePrefix": "Prisinterval",
        "fixedText": "Offentliggjort fast pris",
        "defaultPostal": "1050",
        "defaultCity": "København (DK2)",
        "taxInclVat": 95.13,
        "dsos": [
            {"id": "radius", "name": "Radius Elnet (København & Nordsjælland — DK2)", "gen": 42.0, "day": 58.0, "night": 19.5, "zone": "DK2", "postals": ["1", "2", "3"]},
            {"id": "cerius", "name": "Cerius / Vores Elnet (Sjælland & Fyn — DK2/DK1)", "gen": 39.5, "day": 54.0, "night": 18.0, "zone": "DK2", "postals": ["4", "5"]},
            {"id": "n1", "name": "N1 / Konstant Net / TREFOR (Jylland — DK1)", "gen": 36.0, "day": 49.0, "night": 16.5, "zone": "DK1", "postals": ["6", "7", "8", "9"]},
        ],
    },
    "ee": {
        "lang": "et-EE",
        "geoRegion": "EE",
        "countryName": "Eesti",
        "siteName": "Elektriarvesti // EE-Spot",
        "brandKicker": "NORD POOL EESTI (EE)",
        "brandSubtitle": "Börsielektri hind tundide kaupa, 7 päeva prognoos ja võrgutasu kalkulaator postiindeksiga",
        "navChart": "Börsigraafik",
        "navTable": "Tunnitabel",
        "navTransfer": "Võrgutasu kalkulaator",
        "navOptimizer": "Tarbimise ajastamine (36 h)",
        "chartTitle": "Börsielektri tunnihind ja 7 päeva prognoos (senti/kWh)",
        "hoverHint": "Liiguta kursor tulba kohale, et näha hinda ja tõenäolist hinnavahemikku",
        "legendCheap": "Soodne (< 4 senti/kWh)",
        "legendNorm": "Keskmine (4–10 senti/kWh)",
        "legendHigh": "Kõrge (> 10 senti/kWh)",
        "legendRange": "Prognoosi hinnavahemik (min–max senti/kWh)",
        "legendWind": "Tuuleenergia võimsus (GW, katkendjoon)",
        "scrollDownText": "Keri alla: tunnitabel, võrgutasu kalkulaator postiindeksi järgi ja tarbimise ajastamine",
        "tableHeading": "Tunnipõhine hinnaprognoos ja tõenäoline hinnavahemik (24 h/ööpäev)",
        "colTime": "Kellaaeg (Tund)",
        "colSpot": "Börsihind (prognoos / hind)",
        "colRange": "Tõenäoline hinnavahemik",
        "colTotal": "Koguhind koos võrgutasu ja maksudega",
        "colWeather": "Tuuleenergia ja temperatuur",
        "transferHeading": "Võrgutasu ja elektri koguhinna kalkulaator postiindeksi järgi Eestis",
        "transferLead": "Sisesta oma 5-kohaline postiindeks (nt 10111 Tallinn, 51003 Tartu, 80010 Pärnu, 20308 Narva), et leida automaatselt võrguettevõtja (Elektrilevi, Imatra Elekter, VKG Elektrivõrgud).",
        "postalLabel": "Postiindeks või linn",
        "postalPlaceholder": "10111, 51003, 80010, 20308...",
        "setBtn": "Vali",
        "tariffLabel": "Võrgupakett",
        "tariffGeneral": "Võrk 1 (Põhitariif)",
        "tariffTime": "Võrk 2 / Võrk 4 (Päev / Öö)",
        "marginLabel": "Elektrimüüja marginaal (senti/kWh)",
        "vatLabel": "Käibemaksumäär",
        "vatIncl": "Koos käibemaksuga 22 %",
        "vatZero": "Ilma käibemaksuta (0 %)",
        "unit": "senti/kWh",
        "approxPrefix": "u ",
        "rangePrefix": "Hinnavahemik",
        "fixedText": "Avaldatud fikseeritud hind",
        "defaultPostal": "10111",
        "defaultCity": "Tallinn (EE)",
        "taxInclVat": 1.56,
        "dsos": [
            {"id": "elektrilevi", "name": "Elektrilevi OÜ (Üle-eestiline jaotusvõrk — Võrk 1 / Võrk 2)", "gen": 5.38, "day": 6.25, "night": 3.62, "zone": "EE", "postals": ["1", "3", "4", "5", "6", "7", "8", "9"]},
            {"id": "vkg", "name": "VKG Elektrivõrgud OÜ (Narva, Narva-Jõesuu & Sillamäe)", "gen": 4.92, "day": 5.75, "night": 3.40, "zone": "EE", "postals": ["2"]},
        ],
    },
    "lv": {
        "lang": "lv-LV",
        "geoRegion": "LV",
        "countryName": "Latvija",
        "siteName": "Elektroskaitītājs // LV-Spot",
        "brandKicker": "NORD POOL LATVIJA (LV)",
        "brandSubtitle": "Elektrības biržas cena pa stundām, 7 dienu prognoze un Sadales tīkla tarifu kalkulators",
        "navChart": "Biržas grafiks",
        "navTable": "Stundu tabula",
        "navTransfer": "Sadales tīkla kalkulators",
        "navOptimizer": "Patēriņa plānotājs (36 h)",
        "chartTitle": "Elektrības biržas cena un 7 dienu prognoze (centi/kWh)",
        "hoverHint": "Novietojiet kursoru virs stabiņa, lai redzētu cenu un ticamo cenu intervālu",
        "legendCheap": "Zema cena (< 4 centi/kWh)",
        "legendNorm": "Vidēja (4–10 centi/kWh)",
        "legendHigh": "Augsta cena (> 10 centi/kWh)",
        "legendRange": "Prognozes cenu intervāls (min–max centi/kWh)",
        "legendWind": "HES un vēja jauda (GW, raustīta līnija)",
        "scrollDownText": "Ritiniet uz leju: stundu tabula, Sadales tīkla tarifu kalkulators un slodzes plānošana",
        "tableHeading": "Stundu cenas prognoze un ticamais cenu intervāls (24 h/diennaktī)",
        "colTime": "Laiks (Stunda)",
        "colSpot": "Biržas cena (prognoze / cena)",
        "colRange": "Ticamais cenu intervāls",
        "colTotal": "Kopējā cena ar pārvadi un PVN",
        "colWeather": "Vējš un temperatūra",
        "transferHeading": "AS Sadales tīkls tarifu un kopējās elektrības cenas kalkulators Latvijā",
        "transferLead": "Ievadiet savu pasta indeksu (piem., 1010 Rīga, 3401 Liepāja, 5401 Daugavpils, 3001 Jelgava), lai aprēķinātu pilnu elektrības cenu ar Sadales tīkla tarifu.",
        "postalLabel": "Pasta indekss vai pilsēta",
        "postalPlaceholder": "1010, 3401, 5401, 3001...",
        "setBtn": "Izvēlēties",
        "tariffLabel": "Sadales tīkla tarifs",
        "tariffGeneral": "Pamata tarifs (1 laika zona)",
        "tariffTime": "Speciālais (Diena / Nakts & Brīvdienas)",
        "marginLabel": "Tirgotāja uzcenojums (centi/kWh)",
        "vatLabel": "PVN likme",
        "vatIncl": "Ar PVN 21 %",
        "vatZero": "Bez PVN (0 %)",
        "unit": "centi/kWh",
        "approxPrefix": "aptuveni ",
        "rangePrefix": "Cenu intervāls",
        "fixedText": "Publicēta fiksēta cena",
        "defaultPostal": "1010",
        "defaultCity": "Rīga (LV)",
        "taxInclVat": 0.55,
        "dsos": [
            {"id": "sadales_tikls", "name": "AS Sadales tīkls (Visas Latvijas sadales sistēmas operators)", "gen": 5.08, "day": 6.05, "night": 3.55, "zone": "LV", "postals": ["1", "2", "3", "4", "5"]},
        ],
    },
    "lt": {
        "lang": "lt-LT",
        "geoRegion": "LT",
        "countryName": "Lietuva",
        "siteName": "Elektros skaitiklis // LT-Spot",
        "brandKicker": "NORD POOL LIETUVA (LT)",
        "brandSubtitle": "Elektros biržos kaina valandomis, 7 dienų prognozė ir ESO skaičiuoklė pagal pašto kodą",
        "navChart": "Biržos grafikas",
        "navTable": "Valandų lentelė",
        "navTransfer": "ESO skaičiuoklė",
        "navOptimizer": "Vartojimo planavimas (36 val.)",
        "chartTitle": "Elektros biržos valandinė kaina ir 7 dienų prognozė (ct/kWh)",
        "hoverHint": "Užveskite pelę ant stulpelio, kad matytumėte kainą ir tikėtiną kainos intervalą",
        "legendCheap": "Žema kaina (< 4 ct/kWh)",
        "legendNorm": "Vidutinė (4–10 ct/kWh)",
        "legendHigh": "Aukšta kaina (> 10 ct/kWh)",
        "legendRange": "Prognozės kainos intervalas (min–max ct/kWh)",
        "legendWind": "Vėjo ir saulės gamyba (GW, punktyrinė linija)",
        "scrollDownText": "Slinkite žemyn: valandinė kainų lentelė, ESO persiuntimo skaičiuoklė ir apkrovos planavimas",
        "tableHeading": "Valandinė kainos prognozė ir tikėtinas kainos intervalas (24 val.)",
        "colTime": "Laikas (Valanda)",
        "colSpot": "Biržos kaina (prognozė / kaina)",
        "colRange": "Tikėtinas kainos intervalas",
        "colTotal": "Galutinė kaina su ESO ir PVM",
        "colWeather": "Vėjo galia ir temperatūra",
        "transferHeading": "AB „Energijos skirstymo operatorius“ (ESO) tarifų ir galutinės kainos skaičiuoklė Lietuvoje",
        "transferLead": "Įveskite savo 5 skaitmenų pašto kodą (pvz., 01100 Vilnius, 44248 Kaunas, 91246 Klaipėda, 76125 Šiauliai), kad apskaičiuotumėte galutinę elektros kainą su ESO persiuntimo tarifu.",
        "postalLabel": "Pašto kodas arba miestas",
        "postalPlaceholder": "01100, 44248, 91246...",
        "setBtn": "Nustatyti",
        "tariffLabel": "ESO persiuntimo planas",
        "tariffGeneral": "Standartinis (1 laiko zona)",
        "tariffTime": "Dviejų laiko zonų (Diena / Naktis)",
        "marginLabel": "Tiekėjo marža (ct/kWh)",
        "vatLabel": "PVM tarifas",
        "vatIncl": "Su PVM 21 %",
        "vatZero": "Be PVM (0 %)",
        "unit": "ct/kWh",
        "approxPrefix": "apie ",
        "rangePrefix": "Kainos intervalas",
        "fixedText": "Paskelbta fiksuota kaina",
        "defaultPostal": "01100",
        "defaultCity": "Vilnius (LT)",
        "taxInclVat": 0.65,
        "dsos": [
            {"id": "eso_lt", "name": "AB „Energijos skirstymo operatorius“ (ESO — Visa Lietuva)", "gen": 5.32, "day": 6.41, "night": 3.75, "zone": "LT", "postals": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]},
        ],
    },
}


def build_country_page(cid: str, loc: dict) -> str:
    schema = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": loc["siteName"],
        "description": loc["brandSubtitle"],
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "inLanguage": loc["lang"],
        "areaServed": {
            "@type": "Country",
            "name": loc["countryName"],
            "identifier": loc["geoRegion"],
        },
    }

    loc_json = json.dumps({"countryId": cid, **loc}, ensure_ascii=False)

    return f"""<!DOCTYPE html>
<html lang="{loc['lang']}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{loc['siteName']} — {loc['brandSubtitle']}</title>
    <meta name="description" content="{loc['transferLead']}">
    <meta name="geo.region" content="{loc['geoRegion']}">
    <meta name="content-language" content="{loc['lang']}">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="stylesheet" href="/styles.css?v=22">
    <script type="application/ld+json">
{json.dumps(schema, ensure_ascii=False, indent=2)}
    </script>
    <script>
    window.ACTIVE_COUNTRY_LOCALE = {loc_json};
    </script>
</head>
<body>
    <header class="site-header">
        <div class="header-inner">
            <a href="./" class="brand-link">
                <span class="brand-kicker">{loc['brandKicker']}</span>
                <span class="brand-title"><img src="/favicon.svg" alt="" width="24" height="24" style="vertical-align:-4px; margin-right:7px;">{loc['siteName']}</span>
                <span class="brand-subtitle">{loc['brandSubtitle']}</span>
            </a>
            <nav class="main-nav" aria-label="Navigation">
                <a href="./">{loc['navChart']}</a>
                <a href="#tuntitaulukko">{loc['navTable']}</a>
                <a href="#siirtohintalaskuri">{loc['navTransfer']}</a>
                <a href="#optimoija">{loc['navOptimizer']}</a>
            </nav>
        </div>
    </header>

    <main class="container">
        <div class="first-screen-stage">
            <section class="hero-chart-box">
                <div id="day-tabs" class="day-tabs"></div>

                <div class="panel-body" style="padding:10px 14px; border-bottom:var(--border-heavy);">
                    <div id="chart-readout-strip" class="chart-readout-strip" style="margin-bottom:8px;">
                        {loc['hoverHint']}
                    </div>

                    <div class="chart-legend" style="padding-top:4px;">
                        <span class="legend-item"><span class="legend-swatch" style="background:#009e3d;"></span> {loc['legendCheap']}</span>
                        <span class="legend-item"><span class="legend-swatch" style="background:#0038ff;"></span> {loc['legendNorm']}</span>
                        <span class="legend-item"><span class="legend-swatch" style="background:#ff3b00;"></span> {loc['legendHigh']}</span>
                        <span class="legend-item"><span class="legend-swatch" style="background:#ffd000;"></span> {loc['legendRange']}</span>
                        <h1 id="chart-view-title" style="font-family:var(--mono); font-size:11.5px; font-weight:700; text-transform:uppercase; margin-left:auto;">{loc['chartTitle']}</h1>
                    </div>
                </div>

                <div class="scroll-down-bar" style="margin-top:0; border:none; border-bottom:var(--border-heavy);">
                    <span>{loc['scrollDownText']}</span>
                    <div class="scroll-down-links">
                        <a href="#tuntitaulukko">{loc['navTable']}</a>
                        <a href="#siirtohintalaskuri">{loc['navTransfer']}</a>
                        <a href="#optimoija">{loc['navOptimizer']}</a>
                    </div>
                </div>

                <div class="svg-chart-wrapper">
                    <button type="button" id="chart-prev-day" class="chart-edge-arrow chart-edge-prev" aria-label="Prev">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div id="chart-floating-tooltip" class="chart-floating-tooltip" aria-live="polite"></div>
                    <div id="price-chart" class="svg-chart-container" style="border:none; padding:12px 8px 6px;">
                        ...
                    </div>
                    <button type="button" id="chart-next-day" class="chart-edge-arrow chart-edge-next" aria-label="Next">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>
            </section>

            <div id="first-screen-summary-strip" class="first-screen-summary-strip" aria-live="polite"></div>
        </div>

        <div class="below-fold-section">
            <section class="panel-box" id="tuntitaulukko">
                <div class="panel-head">
                    <h2>{loc['tableHeading']}</h2>
                </div>
                <div class="panel-body">
                    <div class="table-wrap">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>{loc['colTime']}</th>
                                    <th>{loc['colSpot']}</th>
                                    <th>{loc['colRange']}</th>
                                    <th>{loc['colTotal']}</th>
                                    <th>{loc['colWeather']}</th>
                                </tr>
                            </thead>
                            <tbody id="hourly-table-body">
                                <tr><td colspan="5">...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section class="instrument-strip" id="siirtohintalaskuri">
                <div class="instrument-strip-top">
                    <h2>{loc['transferHeading']}</h2>
                    <p>{loc['transferLead']}</p>
                </div>

                <div class="control-matrix">
                    <form id="postal-search-form" class="control-cell" onsubmit="return false;">
                        <label for="postal-input" class="field-label">{loc['postalLabel']}</label>
                        <div class="postal-input-group">
                            <input type="text" id="postal-input" class="input-control" value="{loc['defaultPostal']}" placeholder="{loc['postalPlaceholder']}">
                            <button type="submit" class="btn-primary">{loc['setBtn']}</button>
                        </div>
                    </form>

                    <div class="control-cell">
                        <span class="field-label">{loc['tariffLabel']}</span>
                        <div class="seg-group">
                            <button type="button" class="seg-btn active" data-tariff-btn="general">{loc['tariffGeneral']}</button>
                            <button type="button" class="seg-btn" data-tariff-btn="time">{loc['tariffTime']}</button>
                        </div>
                    </div>

                    <div class="control-cell">
                        <label for="margin-input" class="field-label">{loc['marginLabel']}</label>
                        <input type="number" id="margin-input" class="input-control" step="0.05" min="0" max="50" value="0.45">
                    </div>

                    <div class="control-cell">
                        <label for="vat-select" class="field-label">{loc['vatLabel']}</label>
                        <select id="vat-select" class="select-control">
                            <option value="1" selected>{loc['vatIncl']}</option>
                            <option value="0">{loc['vatZero']}</option>
                        </select>
                    </div>
                </div>

                <div id="detected-dso-banner" class="detected-dso-banner"></div>
            </section>

            <div class="desk-grid">
                <section class="panel-box">
                    <div class="panel-head">
                        <h2>{loc['colTotal']}</h2>
                    </div>
                    <div class="panel-body" id="receipt-ledger-body"></div>
                </section>

                <section class="panel-box" id="optimoija">
                    <div class="panel-head">
                        <h2>{loc['navOptimizer']}</h2>
                    </div>
                    <div class="panel-body">
                        <div class="opt-controls-row">
                            <div style="flex:1; min-width:180px;">
                                <span class="field-label">Duration</span>
                                <div class="seg-group">
                                    <button type="button" class="seg-btn" data-win-hours="1">1h</button>
                                    <button type="button" class="seg-btn" data-win-hours="2">2h</button>
                                    <button type="button" class="seg-btn active" data-win-hours="3">3h</button>
                                    <button type="button" class="seg-btn" data-win-hours="4">4h</button>
                                    <button type="button" class="seg-btn" data-win-hours="6">6h</button>
                                </div>
                            </div>
                            <div style="width:110px;">
                                <label for="appliance-kw-input" class="field-label">kW</label>
                                <input type="number" id="appliance-kw-input" class="input-control" step="0.1" min="0.1" max="50" value="11">
                            </div>
                        </div>
                        <div id="cheapest-window-result"></div>
                    </div>
                </section>
            </div>
        </div>
    </main>

    <footer class="site-footer">
        <div class="footer-inner">
            <div>
                <strong style="color:#ffffff;">{loc['siteName']} ({loc['countryName']})</strong>
                <p style="margin-top:6px; max-width:680px;">{loc['brandSubtitle']}</p>
            </div>
        </div>
    </footer>

    <script src="/dso_data.js"></script>
    <script src="/ml_weights.js"></script>
    <script src="/nordpool_models.js"></script>
    <script src="/app.js?v=22"></script>
</body>
</html>
"""


def main():
    for cid, loc in COUNTRY_LOCALES.items():
        out_dir = os.path.join(ROOT_DIR, cid)
        os.makedirs(out_dir, exist_ok=True)
        out_file = os.path.join(out_dir, "index.html")
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(build_country_page(cid, loc))
        print(f"Generated isolated native Nord Pool site for {loc['countryName']} ({loc['lang']}) -> {out_file}")


if __name__ == "__main__":
    main()
