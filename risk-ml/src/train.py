"""
train.py — Pipeline de treinamento do modelo de risco (Task #4).

Dataset: health_markers_dataset.csv (9 biomarcadores -> Condition).
IMPORTANTE: o dataset é SINTÉTICO/baseado-em-regras (ver docs/RISK_MODULE_DESIGN.md).
A acurácia ~100% NÃO generaliza; o modelo é 2ª opinião, a camada de regras é primária.

Pipeline:
  load -> split estratificado -> imputação mediana -> [std p/ LR] ->
  RF + LR + DT (class_weight='balanced') ->
  métricas (acc, precision, recall, F1, matriz de confusão) + CV 5-fold ->
  salva rf_pipeline.joblib + model_meta.joblib

Uso:
  python src/train.py --csv path/para/health_markers_dataset.csv
"""
from __future__ import annotations
import argparse
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
import joblib
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import (classification_report, confusion_matrix,
                             accuracy_score, precision_recall_fscore_support)

FEATS = ['Blood_glucose', 'HbA1C', 'Systolic_BP', 'Diastolic_BP', 'LDL',
         'HDL', 'Triglycerides', 'Haemoglobin', 'MCV']
TARGET = 'Condition'
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def _pipeline(clf, scale=False) -> Pipeline:
    steps = [('impute', SimpleImputer(strategy='median'))]
    if scale:
        steps.append(('scale', StandardScaler()))
    steps.append(('clf', clf))
    return Pipeline(steps)


def main(csv_path: str) -> None:
    df = pd.read_csv(csv_path)
    X, y = df[FEATS], df[TARGET]
    classes = np.sort(y.unique())
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    models = {
        "Dummy (sempre Fit)":  _pipeline(DummyClassifier(strategy='most_frequent')),
        "DecisionTree":        _pipeline(DecisionTreeClassifier(max_depth=6, class_weight='balanced', random_state=42)),
        "LogisticRegression":  _pipeline(LogisticRegression(max_iter=1000, class_weight='balanced'), scale=True),
        "RandomForest":        _pipeline(RandomForestClassifier(n_estimators=200, class_weight='balanced',
                                                                n_jobs=-1, random_state=42)),
    }

    print(f"=== TREINO  n={len(df)}  split 80/20 estratificado  class_weight=balanced ===\n")
    res = {}
    for name, m in models.items():
        m.fit(Xtr, ytr)
        pred = m.predict(Xte)
        acc = accuracy_score(yte, pred)
        p, r, f, _ = precision_recall_fscore_support(yte, pred, average='macro', zero_division=0)
        res[name] = dict(acc=acc, f=f)
        print(f"  {name:22s} acc={acc:.4f}  macroF1={f:.4f}")

    rf = models["RandomForest"]
    pred = rf.predict(Xte)
    print("\n=== RandomForest — relatório por classe ===")
    print(classification_report(yte, pred, zero_division=0))
    print("=== RandomForest — matriz de confusão (linhas=real) ===")
    print(pd.DataFrame(confusion_matrix(yte, pred, labels=classes),
                       index=classes, columns=classes).to_string())
    print("\n=== Importância das features ===")
    imp = rf.named_steps['clf'].feature_importances_
    for f_, i in sorted(zip(FEATS, imp), key=lambda x: -x[1]):
        print(f"  {f_:16s} {i:.4f}")

    cv = StratifiedKFold(5, shuffle=True, random_state=42)
    scores = cross_val_score(rf, X, y, cv=cv, scoring='f1_macro', n_jobs=-1)
    print(f"\n=== CV 5-fold macroF1: {scores.mean():.4f} ± {scores.std():.4f} ===")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(rf, MODELS_DIR / "rf_pipeline.joblib")
    meta = dict(
        features=FEATS, classes=list(classes),
        n_train=len(Xtr), n_test=len(Xte),
        test_accuracy=float(res['RandomForest']['acc']),
        test_macro_f1=float(res['RandomForest']['f']),
        cv_macro_f1_mean=float(scores.mean()), cv_macro_f1_std=float(scores.std()),
        baseline_accuracy_always_fit=float((y == 'Fit').mean()),
        note="DATASET IS RULE-BASED/SYNTHETIC - accuracy inflated, not generalizable. "
             "Use only as 2nd opinion; rules_engine is primary.",
    )
    joblib.dump(meta, MODELS_DIR / "model_meta.joblib")
    print(f"\nSalvo: {MODELS_DIR/'rf_pipeline.joblib'} + model_meta.joblib")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="C:/Users/esantos/Downloads/health_markers_dataset.csv")
    main(ap.parse_args().csv)
