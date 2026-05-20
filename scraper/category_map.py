# Mapiranje kategorija s NajCijena.hr → akcije.hr category slug

CATEGORY_MAP = {
    "meso i riba": "meso",
    "meso": "meso",
    "riba": "meso",
    "mlijecni proizvodi i jaja": "mlijecno",
    "mlijeko": "mlijeko",
    "mlijecno": "mlijecno",
    "pekarski proizvodi": "pekarski",
    "voce i povrce": "voce",
    "voce": "voce",
    "povrce": "voce",
    "pice": "pice",
    "bezalkoholna pica": "pice",
    "alkoholna pica": "pice",
    "tjestenina, riza, njoki, tortilje": "tjestenina",
    "tjestenina": "tjestenina",
    "ulja": "ulja",
    "slatkisi i grickalice": "slatkisi",
    "slatkisi": "slatkisi",
    "kemija": "kemija",
    "sredstva za pranje i ciscenje": "kemija",
    "higijenski proizvodi": "kemija",
    "elektronika": "elektronika",
    "audio-video, foto": "elektronika",
    "kucanski aparati": "elektronika",
    "obuca": "obuca",
    "zenska obuca": "obuca",
    "muska obuca": "obuca",
    "djecja obuca": "obuca",
    "dom": "dom",
    "namjestaj": "dom",
    "kucni ljubimci": "kemija",
    "konzervirano i juhe": "tjestenina",
    "delikatesa": "pekarski",
    "smrznuta hrana": "meso",
    "ostalo": "dom",
}


def map_category(raw: str | None) -> str:
    if not raw:
        return "dom"
    key = raw.strip().lower()
    return CATEGORY_MAP.get(key, "dom")
