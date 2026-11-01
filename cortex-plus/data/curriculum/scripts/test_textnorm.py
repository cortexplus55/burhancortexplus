import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from textnorm import normalize_text as n, tr_title
assert n('yansıtabilmea) Bölme') == 'yansıtabilme a) Bölme'
assert n('kelimeSonraki söz') == 'kelime Sonraki söz'
for keep in ['TBMM açıldı', 'GY.1.a Sözel', 'McDonald', 'eTwinning', 'iPhone', 'pH ile pOH', 'NaCl NaOH CaCO3 KMnO4', 'mmHg mL', 'Felsefe (philosophia) terimi', 'vb) yer', '(örnek a) Bir)']:
    assert n(keep) == keep, keep
assert tr_title('MÖ 6. YÜZYIL-MS 2. YÜZYIL FELSEFESİ') == 'MÖ 6. Yüzyıl-MS 2. Yüzyıl Felsefesi'
assert tr_title('FELSEFE İLE DÜŞÜNME') == 'Felsefe ile Düşünme'
print('textnorm ok')
