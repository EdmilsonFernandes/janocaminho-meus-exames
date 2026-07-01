"""
retrain.py — Retreino do modelo de risco com dados REAIS doados (flywheel).

O train.py treina no dataset SINTÉTICO (CSV). Este script retreina no dataset REAL
anonimizado coletado pelo app (tabela data_contributions / endpoint admin /risk-dataset),
que os pacientes doam via opt-in LGPD. É o passo que transforma o CSV-protótipo num
modelo que GENERALIZA (o moat de longo prazo).

Fluxo:
  GET /admin/risk-dataset (com token admin)
   → records[{conditionKey, riskLevel, markers:{GLICEMIA:..}, sex, ageRange}]
   → DataFrame (features PascalCase + label) → retreina RF → salva rf_pipeline_v2.joblib

Uso:
  python src/retrain.py --url https://app.../api/admin/risk-dataset --token $ADMIN_TOKEN
  python src/retrain.py --json export.json            # dataset salvo localmente

AVISO: com poucos registros, as métricas são fracas. Volume mínimo recomendado: ~1k
registas balanceados. Sempre validar com clínico antes de promover o modelo a produção.
"""
from __future__ import annotations
import argparse
import json
import sys
import urllib.request
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report, accuracy_score, precision_recall_fscore_support

FEATS = ['Blood_glucose', 'HbA1C', 'Systolic_BP', 'Diastolic_BP', 'LDL',
         'HDL', 'Triglycerides', 'Haemoglobin', 'MCV']
# chave canônica do server (markers) -> coluna do modelo
CANON2COL = {
    'GLICEMIA': 'Blood_glucose', 'HEMOGLOBINA_GLICADA': 'HbA1C',
    'PRESSAO_SISTOLICA': 'Systolic_BP', 'PRESSAO_DIASTOLICA': 'Diastolic_BP',
    'LDL': 'LDL', 'HDL': 'HDL', 'TRIGLICERIDES': 'Triglycerides',
    'HEMOGLOBINA': 'Haemoglobin', 'VCM': 'MCV',
}
# conditionKey do app -> label do modelo (modelo original: Fit/Diabetes/Hypertension/High_Cholesterol/Anemia)
COND2LABEL = {
    'none': 'Fit', 'prediabetes': 'Fit',           # pré-diabetes sem classe própria → Fit
    'diabetes': 'Diabetes', 'hypertension': 'Hypertension',
    'high_cholesterol': 'High_Cholesterol', 'cardiovascular_risk': 'High_Cholesterol',
    'anemia': 'Anemia',
}
OUT = Path(__file__).resolve().parent.parent / "models"


def load_dataset(args) -> list[dict]:
    if args.json:
        with open(args.json, encoding='utf-8') as f:
            d = json.load(f)
        return d.get('records', d) if isinstance(d, dict) else d
    req = urllib.request.Request(args.url, headers={'Authorization': f'Bearer {args.token}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get('records', [])


def to_dataframe(records: list[dict]) -> pd.DataFrame:
    rows = []
    for rec in records:
        markers = rec.get('markers') or {}
        row = {col: markers.get(canon) for canon, col in CANON2COL.items()}
        row['Condition'] = COND2LABEL.get(rec.get('conditionKey'))
        if row['Condition']:
            rows.append(row)
    return pd.DataFrame(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', help='arquivo JSON do dataset (export local)')
    ap.add_argument('--url', default='', help='URL de /admin/risk-dataset')
    ap.add_argument('--token', default='', help='token admin p/ a URL')
    args = ap.parse_args()

    records = load_dataset(args)
    df = to_dataframe(records)
    if len(df) < 50:
        print(f'POUCOS REGISTROS ({len(df)}). Volume mínimo recomendado ~1k. Abortando retreino.')
        sys.exit(1)

    print(f'=== RETREINO com dados REAIS  n={len(df)} ===')
    X, y = df[FEATS], df['Condition']
    print('Distribuição:\n', y.value_counts())

    # split só se houver ≥2 classes com ≥2 amostras cada
    vc = y.value_counts()
    can_split = len(vc) >= 2 and vc.min() >= 2
    pipe = Pipeline([('imp', SimpleImputer(strategy='median')),
                     ('clf', RandomForestClassifier(n_estimators=200, class_weight='balanced',
                                                     n_jobs=-1, random_state=42))])
    if can_split and len(df) >= 100:
        Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        pipe.fit(Xtr, ytr)
        pred = pipe.predict(Xte)
        p, r, f, _ = precision_recall_fscore_support(yte, pred, average='macro', zero_division=0)
        print(f'acc={accuracy_score(yte, pred):.4f}  macroF1={f:.4f}  (precision={p:.4f} recall={r:.4f})')
        cv = StratifiedKFold(5, shuffle=True, random_state=42)
        scores = cross_val_score(pipe, X, y, cv=cv, scoring='f1_macro', n_jobs=-1)
        print(f'CV 5-fold macroF1: {scores.mean():.4f} ± {scores.std():.4f}')
    else:
        pipe.fit(X, y)
        print('Split/CV pulado (poucas amostras por classe). Modelo ajustado em tudo.')

    OUT.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipe, OUT / 'rf_pipeline_v2.joblib')
    joblib.dump(dict(features=FEATS, classes=list(pipe.classes_), n=len(df),
                     source='real_anonymized', note='Retreinado com dados doados (flywheel). Validar c/ clínico.'),
                OUT / 'model_meta_v2.joblib')
    print(f'\nSalvo: {OUT/"rf_pipeline_v2.joblib"} (+ model_meta_v2.joblib)')
    print('Antes de promover a produção: revisar métricas, calibrar (Platt/isotônico) e validação clínica.')


if __name__ == '__main__':
    main()
