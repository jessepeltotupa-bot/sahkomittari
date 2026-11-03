window.PORSSISAHKO_ML_WEIGHTS = {
  "trainedAt": "2026-11-03T15:25:27Z",
  "totalObservations": 17552,
  "firstObservationDate": "2024-11-03",
  "lastObservationDate": "2026-11-05",
  "model": {
    "weights": [
      6.87816,
      -10.54256,
      2.17747,
      5.71309,
      -0.91061,
      0.01325,
      3.40911,
      2.48057,
      -2.01243,
      -1.78988,
      6.8653,
      1.68846,
      1.21952,
      3.13493
    ],
    "weekdayHourAdj": [
      -0.084,
      0.096,
      -0.503,
      -0.721,
      -0.628,
      -0.344,
      -0.515,
      -1.431,
      0.116,
      0.388,
      -0.28,
      1.857,
      1.358,
      1.01,
      0.604,
      0.583,
      -1.308,
      -0.489,
      0.489,
      0.837,
      0.183,
      -1.156,
      0.616,
      -0.616
    ],
    "weekendHourAdj": [
      1.075,
      0.923,
      0.83,
      0.713,
      0.631,
      0.497,
      -0.858,
      -0.506,
      -0.522,
      -0.422,
      -0.595,
      -0.805,
      -0.94,
      -1.134,
      -1.251,
      -1.072,
      -0.427,
      0.529,
      1.199,
      1.472,
      1.097,
      0.266,
      -0.176,
      -0.707
    ],
    "windTempGridAdj": {
      "2_1": -0.821,
      "3_1": -0.373,
      "1_1": -0.487,
      "1_2": -0.033,
      "0_2": -0.055,
      "0_1": -0.846,
      "2_2": -0.764,
      "3_2": -0.4,
      "4_2": 0.135,
      "4_1": 0.213,
      "0_0": -0.574,
      "1_0": 0.207,
      "2_0": 0.233,
      "3_0": 0.205,
      "4_0": 0.636,
      "3_3": -0.048,
      "4_3": 0.197,
      "0_3": -1.048,
      "2_3": -0.2,
      "1_3": -0.541
    },
    "empiricalMatrix": {
      "2_1": {
        "avgPrice": 3.5,
        "hoursCount": 743
      },
      "3_1": {
        "avgPrice": 2.04,
        "hoursCount": 516
      },
      "1_1": {
        "avgPrice": 7.48,
        "hoursCount": 916
      },
      "1_2": {
        "avgPrice": 5.73,
        "hoursCount": 1994
      },
      "0_2": {
        "avgPrice": 10.53,
        "hoursCount": 1376
      },
      "0_1": {
        "avgPrice": 12.06,
        "hoursCount": 908
      },
      "2_2": {
        "avgPrice": 2.83,
        "hoursCount": 874
      },
      "3_2": {
        "avgPrice": 1.41,
        "hoursCount": 693
      },
      "4_2": {
        "avgPrice": 0.59,
        "hoursCount": 1077
      },
      "4_1": {
        "avgPrice": 1.15,
        "hoursCount": 658
      },
      "0_0": {
        "avgPrice": 18.59,
        "hoursCount": 1059
      },
      "1_0": {
        "avgPrice": 12.27,
        "hoursCount": 495
      },
      "2_0": {
        "avgPrice": 8.41,
        "hoursCount": 321
      },
      "3_0": {
        "avgPrice": 5.89,
        "hoursCount": 96
      },
      "4_0": {
        "avgPrice": 3.65,
        "hoursCount": 52
      },
      "3_3": {
        "avgPrice": 0.98,
        "hoursCount": 431
      },
      "4_3": {
        "avgPrice": 0.44,
        "hoursCount": 483
      },
      "0_3": {
        "avgPrice": 6.59,
        "hoursCount": 2590
      },
      "2_3": {
        "avgPrice": 2.13,
        "hoursCount": 786
      },
      "1_3": {
        "avgPrice": 3.35,
        "hoursCount": 1484
      }
    }
  },
  "learningCurve": {
    "naiveBaselineMaeCents": 7.16,
    "stages": [
      {
        "label": "Alkuvaihe (3 vrk / 72 tuntia)",
        "hours": 72,
        "maeCents": 7.46
      },
      {
        "label": "Viikkotaso (7 vrk / 168 tuntia)",
        "hours": 168,
        "maeCents": 6.46
      },
      {
        "label": "Kuukausitaso (30 vrk / 720 tuntia)",
        "hours": 720,
        "maeCents": 2.87
      },
      {
        "label": "Puolivuotistaso (180 vrk / 4 320 tuntia)",
        "hours": 4320,
        "maeCents": 2.43
      },
      {
        "label": "Täysi opittu historia (17552 tuntia / 2 vuotta)",
        "hours": 17552,
        "maeCents": 1.71
      }
    ],
    "currentMaeCents": 1.71,
    "improvementPct": 76.1
  },
  "insights": {
    "avgPriceLowWindUnder1500Mw": 10.72,
    "avgPriceHighWindOver4500Mw": 1.47,
    "avgPriceFreezingUnderMinus5C": 14.44,
    "windEffectPer1000MwCents": -2.64
  },
  "monthlySummary": [
    {
      "month": 1,
      "name": "Tammi",
      "avgPrice": 10.67,
      "avgWindMw": 3221,
      "avgTempC": -6.4,
      "hours": 1488
    },
    {
      "month": 2,
      "name": "Helmi",
      "avgPrice": 11.57,
      "avgWindMw": 2720,
      "avgTempC": -7.4,
      "hours": 1344
    },
    {
      "month": 3,
      "name": "Maalis",
      "avgPrice": 4.72,
      "avgWindMw": 4261,
      "avgTempC": 1.3,
      "hours": 1486
    },
    {
      "month": 4,
      "name": "Huhti",
      "avgPrice": 6.1,
      "avgWindMw": 2887,
      "avgTempC": 4.7,
      "hours": 1440
    },
    {
      "month": 5,
      "name": "Touko",
      "avgPrice": 4.46,
      "avgWindMw": 2666,
      "avgTempC": 9.5,
      "hours": 1488
    },
    {
      "month": 6,
      "name": "Kesä",
      "avgPrice": 4.01,
      "avgWindMw": 2342,
      "avgTempC": 14.7,
      "hours": 1440
    },
    {
      "month": 7,
      "name": "Heinä",
      "avgPrice": 2.48,
      "avgWindMw": 1746,
      "avgTempC": 17.9,
      "hours": 1488
    },
    {
      "month": 8,
      "name": "Elo",
      "avgPrice": 6.05,
      "avgWindMw": 2677,
      "avgTempC": 10.0,
      "hours": 1488
    },
    {
      "month": 9,
      "name": "Syys",
      "avgPrice": 6.2,
      "avgWindMw": 3174,
      "avgTempC": 11.3,
      "hours": 1440
    },
    {
      "month": 10,
      "name": "Loka",
      "avgPrice": 5.46,
      "avgWindMw": 4179,
      "avgTempC": 7.6,
      "hours": 1490
    },
    {
      "month": 11,
      "name": "Marras",
      "avgPrice": 6.36,
      "avgWindMw": 3779,
      "avgTempC": 2.2,
      "hours": 1472
    },
    {
      "month": 12,
      "name": "Joulu",
      "avgPrice": 4.69,
      "avgWindMw": 4395,
      "avgTempC": -0.6,
      "hours": 1488
    }
  ],
  "recentBacktest": [
    {
      "epochMs": 1793574000000,
      "dateKey": "2026-11-02",
      "hour": 1,
      "actual": 7.094,
      "predicted": 5.8,
      "windMw": 2432,
      "tempC": 7.4
    },
    {
      "epochMs": 1793577600000,
      "dateKey": "2026-11-02",
      "hour": 2,
      "actual": 5.423,
      "predicted": 5.67,
      "windMw": 2038,
      "tempC": 7.2
    },
    {
      "epochMs": 1793581200000,
      "dateKey": "2026-11-02",
      "hour": 3,
      "actual": 4.007,
      "predicted": 5.31,
      "windMw": 2115,
      "tempC": 6.9
    },
    {
      "epochMs": 1793584800000,
      "dateKey": "2026-11-02",
      "hour": 4,
      "actual": 4.54,
      "predicted": 5.47,
      "windMw": 2102,
      "tempC": 6.3
    },
    {
      "epochMs": 1793588400000,
      "dateKey": "2026-11-02",
      "hour": 5,
      "actual": 4.035,
      "predicted": 6.79,
      "windMw": 1525,
      "tempC": 6.0
    },
    {
      "epochMs": 1793592000000,
      "dateKey": "2026-11-02",
      "hour": 6,
      "actual": 13.281,
      "predicted": 8.94,
      "windMw": 1401,
      "tempC": 5.7
    },
    {
      "epochMs": 1793595600000,
      "dateKey": "2026-11-02",
      "hour": 7,
      "actual": 22.285,
      "predicted": 15.02,
      "windMw": 1066,
      "tempC": 5.5
    },
    {
      "epochMs": 1793599200000,
      "dateKey": "2026-11-02",
      "hour": 8,
      "actual": 42.034,
      "predicted": 17.83,
      "windMw": 753,
      "tempC": 5.3
    },
    {
      "epochMs": 1793602800000,
      "dateKey": "2026-11-02",
      "hour": 9,
      "actual": 43.925,
      "predicted": 17.97,
      "windMw": 754,
      "tempC": 5.5
    },
    {
      "epochMs": 1793606400000,
      "dateKey": "2026-11-02",
      "hour": 10,
      "actual": 45.395,
      "predicted": 17.71,
      "windMw": 627,
      "tempC": 5.8
    },
    {
      "epochMs": 1793610000000,
      "dateKey": "2026-11-02",
      "hour": 11,
      "actual": 47.217,
      "predicted": 14.11,
      "windMw": 429,
      "tempC": 6.0
    },
    {
      "epochMs": 1793613600000,
      "dateKey": "2026-11-02",
      "hour": 12,
      "actual": 48.999,
      "predicted": 14.59,
      "windMw": 169,
      "tempC": 6.3
    },
    {
      "epochMs": 1793617200000,
      "dateKey": "2026-11-02",
      "hour": 13,
      "actual": 50.511,
      "predicted": 13.97,
      "windMw": 169,
      "tempC": 7.0
    },
    {
      "epochMs": 1793620800000,
      "dateKey": "2026-11-02",
      "hour": 14,
      "actual": 48.382,
      "predicted": 13.38,
      "windMw": 169,
      "tempC": 7.5
    },
    {
      "epochMs": 1793624400000,
      "dateKey": "2026-11-02",
      "hour": 15,
      "actual": 37.274,
      "predicted": 13.25,
      "windMw": 202,
      "tempC": 7.3
    },
    {
      "epochMs": 1793628000000,
      "dateKey": "2026-11-02",
      "hour": 16,
      "actual": 43.453,
      "predicted": 14.61,
      "windMw": 737,
      "tempC": 7.1
    },
    {
      "epochMs": 1793631600000,
      "dateKey": "2026-11-02",
      "hour": 17,
      "actual": 50.761,
      "predicted": 13.21,
      "windMw": 1330,
      "tempC": 7.0
    },
    {
      "epochMs": 1793635200000,
      "dateKey": "2026-11-02",
      "hour": 18,
      "actual": 34.629,
      "predicted": 12.27,
      "windMw": 2091,
      "tempC": 6.6
    },
    {
      "epochMs": 1793638800000,
      "dateKey": "2026-11-02",
      "hour": 19,
      "actual": 22.271,
      "predicted": 12.46,
      "windMw": 2248,
      "tempC": 5.9
    },
    {
      "epochMs": 1793642400000,
      "dateKey": "2026-11-02",
      "hour": 20,
      "actual": 20.544,
      "predicted": 10.61,
      "windMw": 2897,
      "tempC": 5.5
    },
    {
      "epochMs": 1793646000000,
      "dateKey": "2026-11-02",
      "hour": 21,
      "actual": 10.693,
      "predicted": 8.6,
      "windMw": 3285,
      "tempC": 5.0
    },
    {
      "epochMs": 1793649600000,
      "dateKey": "2026-11-02",
      "hour": 22,
      "actual": 6.675,
      "predicted": 5.6,
      "windMw": 3616,
      "tempC": 4.6
    },
    {
      "epochMs": 1793653200000,
      "dateKey": "2026-11-02",
      "hour": 23,
      "actual": 2.887,
      "predicted": 4.34,
      "windMw": 3707,
      "tempC": 4.0
    },
    {
      "epochMs": 1793656800000,
      "dateKey": "2026-11-03",
      "hour": 0,
      "actual": 0.877,
      "predicted": 1.73,
      "windMw": 4600,
      "tempC": 3.6
    },
    {
      "epochMs": 1793660400000,
      "dateKey": "2026-11-03",
      "hour": 1,
      "actual": 0.724,
      "predicted": 1.22,
      "windMw": 5474,
      "tempC": 3.1
    },
    {
      "epochMs": 1793664000000,
      "dateKey": "2026-11-03",
      "hour": 2,
      "actual": 0.641,
      "predicted": 0.05,
      "windMw": 6037,
      "tempC": 3.0
    },
    {
      "epochMs": 1793667600000,
      "dateKey": "2026-11-03",
      "hour": 3,
      "actual": 0.599,
      "predicted": 0.05,
      "windMw": 6348,
      "tempC": 2.6
    },
    {
      "epochMs": 1793671200000,
      "dateKey": "2026-11-03",
      "hour": 4,
      "actual": 0.595,
      "predicted": 0.05,
      "windMw": 6339,
      "tempC": 3.1
    },
    {
      "epochMs": 1793674800000,
      "dateKey": "2026-11-03",
      "hour": 5,
      "actual": 0.62,
      "predicted": 0.05,
      "windMw": 6454,
      "tempC": 3.4
    },
    {
      "epochMs": 1793678400000,
      "dateKey": "2026-11-03",
      "hour": 6,
      "actual": 0.67,
      "predicted": 0.72,
      "windMw": 7605,
      "tempC": 3.9
    },
    {
      "epochMs": 1793682000000,
      "dateKey": "2026-11-03",
      "hour": 7,
      "actual": 1.08,
      "predicted": 0.94,
      "windMw": 7605,
      "tempC": 4.3
    },
    {
      "epochMs": 1793685600000,
      "dateKey": "2026-11-03",
      "hour": 8,
      "actual": 1.89,
      "predicted": 2.76,
      "windMw": 7605,
      "tempC": 4.6
    },
    {
      "epochMs": 1793689200000,
      "dateKey": "2026-11-03",
      "hour": 9,
      "actual": 2.183,
      "predicted": 3.31,
      "windMw": 7605,
      "tempC": 4.7
    },
    {
      "epochMs": 1793692800000,
      "dateKey": "2026-11-03",
      "hour": 10,
      "actual": 1.868,
      "predicted": 2.94,
      "windMw": 7605,
      "tempC": 5.2
    },
    {
      "epochMs": 1793696400000,
      "dateKey": "2026-11-03",
      "hour": 11,
      "actual": 2.021,
      "predicted": 4.39,
      "windMw": 7605,
      "tempC": 5.9
    },
    {
      "epochMs": 1793700000000,
      "dateKey": "2026-11-03",
      "hour": 12,
      "actual": 2.133,
      "predicted": 4.21,
      "windMw": 7605,
      "tempC": 6.3
    },
    {
      "epochMs": 1793703600000,
      "dateKey": "2026-11-03",
      "hour": 13,
      "actual": 2.005,
      "predicted": 4.22,
      "windMw": 7572,
      "tempC": 6.6
    },
    {
      "epochMs": 1793707200000,
      "dateKey": "2026-11-03",
      "hour": 14,
      "actual": 2.869,
      "predicted": 4.7,
      "windMw": 6506,
      "tempC": 6.6
    },
    {
      "epochMs": 1793710800000,
      "dateKey": "2026-11-03",
      "hour": 15,
      "actual": 3.098,
      "predicted": 6.29,
      "windMw": 4960,
      "tempC": 6.4
    },
    {
      "epochMs": 1793714400000,
      "dateKey": "2026-11-03",
      "hour": 16,
      "actual": 3.639,
      "predicted": 8.87,
      "windMw": 4135,
      "tempC": 5.7
    },
    {
      "epochMs": 1793718000000,
      "dateKey": "2026-11-03",
      "hour": 17,
      "actual": 7.06,
      "predicted": 11.5,
      "windMw": 3419,
      "tempC": 5.0
    },
    {
      "epochMs": 1793721600000,
      "dateKey": "2026-11-03",
      "hour": 18,
      "actual": 17.367,
      "predicted": 14.52,
      "windMw": 2936,
      "tempC": 4.1
    },
    {
      "epochMs": 1793725200000,
      "dateKey": "2026-11-03",
      "hour": 19,
      "actual": 29.539,
      "predicted": 17.01,
      "windMw": 2045,
      "tempC": 3.2
    },
    {
      "epochMs": 1793728800000,
      "dateKey": "2026-11-03",
      "hour": 20,
      "actual": 33.288,
      "predicted": 20.33,
      "windMw": 879,
      "tempC": 2.6
    },
    {
      "epochMs": 1793732400000,
      "dateKey": "2026-11-03",
      "hour": 21,
      "actual": 33.226,
      "predicted": 22.5,
      "windMw": 169,
      "tempC": 2.3
    },
    {
      "epochMs": 1793736000000,
      "dateKey": "2026-11-03",
      "hour": 22,
      "actual": 33.079,
      "predicted": 18.61,
      "windMw": 169,
      "tempC": 2.0
    },
    {
      "epochMs": 1793739600000,
      "dateKey": "2026-11-03",
      "hour": 23,
      "actual": 27.571,
      "predicted": 16.13,
      "windMw": 276,
      "tempC": 1.8
    },
    {
      "epochMs": 1793743200000,
      "dateKey": "2026-11-04",
      "hour": 0,
      "actual": 16.955,
      "predicted": 11.16,
      "windMw": 1195,
      "tempC": 1.6
    },
    {
      "epochMs": 1793746800000,
      "dateKey": "2026-11-04",
      "hour": 1,
      "actual": 14.697,
      "predicted": 10.34,
      "windMw": 1703,
      "tempC": 1.6
    },
    {
      "epochMs": 1793750400000,
      "dateKey": "2026-11-04",
      "hour": 2,
      "actual": 2.385,
      "predicted": 7.96,
      "windMw": 2710,
      "tempC": 1.9
    },
    {
      "epochMs": 1793754000000,
      "dateKey": "2026-11-04",
      "hour": 3,
      "actual": 0.971,
      "predicted": 7.18,
      "windMw": 3347,
      "tempC": 2.2
    },
    {
      "epochMs": 1793757600000,
      "dateKey": "2026-11-04",
      "hour": 4,
      "actual": 0.971,
      "predicted": 5.46,
      "windMw": 4081,
      "tempC": 2.3
    },
    {
      "epochMs": 1793761200000,
      "dateKey": "2026-11-04",
      "hour": 5,
      "actual": 1.058,
      "predicted": 4.73,
      "windMw": 4793,
      "tempC": 2.4
    },
    {
      "epochMs": 1793764800000,
      "dateKey": "2026-11-04",
      "hour": 6,
      "actual": 1.326,
      "predicted": 6.43,
      "windMw": 5148,
      "tempC": 2.6
    },
    {
      "epochMs": 1793768400000,
      "dateKey": "2026-11-04",
      "hour": 7,
      "actual": 2.284,
      "predicted": 7.32,
      "windMw": 5610,
      "tempC": 3.2
    },
    {
      "epochMs": 1793772000000,
      "dateKey": "2026-11-04",
      "hour": 8,
      "actual": 2.393,
      "predicted": 8.1,
      "windMw": 5908,
      "tempC": 3.7
    },
    {
      "epochMs": 1793775600000,
      "dateKey": "2026-11-04",
      "hour": 9,
      "actual": 1.865,
      "predicted": 7.11,
      "windMw": 6395,
      "tempC": 4.5
    },
    {
      "epochMs": 1793779200000,
      "dateKey": "2026-11-04",
      "hour": 10,
      "actual": 1.571,
      "predicted": 4.4,
      "windMw": 7605,
      "tempC": 5.2
    },
    {
      "epochMs": 1793782800000,
      "dateKey": "2026-11-04",
      "hour": 11,
      "actual": 1.3,
      "predicted": 5.26,
      "windMw": 7605,
      "tempC": 5.9
    },
    {
      "epochMs": 1793786400000,
      "dateKey": "2026-11-04",
      "hour": 12,
      "actual": 1.475,
      "predicted": 4.46,
      "windMw": 7605,
      "tempC": 6.9
    },
    {
      "epochMs": 1793790000000,
      "dateKey": "2026-11-04",
      "hour": 13,
      "actual": 1.482,
      "predicted": 3.8,
      "windMw": 7605,
      "tempC": 7.4
    },
    {
      "epochMs": 1793793600000,
      "dateKey": "2026-11-04",
      "hour": 14,
      "actual": 1.288,
      "predicted": 3.08,
      "windMw": 7605,
      "tempC": 7.7
    },
    {
      "epochMs": 1793797200000,
      "dateKey": "2026-11-04",
      "hour": 15,
      "actual": 1.241,
      "predicted": 2.75,
      "windMw": 7605,
      "tempC": 7.8
    },
    {
      "epochMs": 1793800800000,
      "dateKey": "2026-11-04",
      "hour": 16,
      "actual": 1.573,
      "predicted": 1.44,
      "windMw": 7605,
      "tempC": 7.7
    },
    {
      "epochMs": 1793804400000,
      "dateKey": "2026-11-04",
      "hour": 17,
      "actual": 1.629,
      "predicted": 2.02,
      "windMw": 7605,
      "tempC": 7.6
    },
    {
      "epochMs": 1793808000000,
      "dateKey": "2026-11-04",
      "hour": 18,
      "actual": 1.643,
      "predicted": 2.77,
      "windMw": 7605,
      "tempC": 7.6
    },
    {
      "epochMs": 1793811600000,
      "dateKey": "2026-11-04",
      "hour": 19,
      "actual": 1.544,
      "predicted": 3.08,
      "windMw": 7605,
      "tempC": 7.3
    },
    {
      "epochMs": 1793815200000,
      "dateKey": "2026-11-04",
      "hour": 20,
      "actual": 1.067,
      "predicted": 2.5,
      "windMw": 7605,
      "tempC": 7.0
    },
    {
      "epochMs": 1793818800000,
      "dateKey": "2026-11-04",
      "hour": 21,
      "actual": 0.593,
      "predicted": 1.24,
      "windMw": 7605,
      "tempC": 6.5
    },
    {
      "epochMs": 1793822400000,
      "dateKey": "2026-11-04",
      "hour": 22,
      "actual": 0.597,
      "predicted": 2.35,
      "windMw": 7605,
      "tempC": 6.2
    },
    {
      "epochMs": 1793826000000,
      "dateKey": "2026-11-04",
      "hour": 23,
      "actual": 0.356,
      "predicted": 1.25,
      "windMw": 7605,
      "tempC": 6.0
    },
    {
      "epochMs": 1793829600000,
      "dateKey": "2026-11-05",
      "hour": 0,
      "actual": 0.271,
      "predicted": 0.05,
      "windMw": 7605,
      "tempC": 6.1
    }
  ]
};
