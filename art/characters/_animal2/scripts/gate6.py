# 関門 6 の数字（「動物の二本足」型の共通の台本）: work/stage5-log.json と config から gate/gate6.json を作る。
# 決まり: 伸び ≤ range.pass.stretch_max・縮み ≥ shrink_min・折り返し 0・めりこみ 0・しっぽのつなぎ目 tail_min〜tail_max（立ち姿に対して）、
#   着いている足の裏 ≤ 0.5mm（身長 1000）・すべり = 着いている足首の 1 コマの動きが一定（差 ≤ 0.05mm）・1 周のつなぎ目 0、
#   歩き・走りの股とひざは 立ち姿の角度 ＋ limits の 8 割 の中（股: 前 thighFwd・後ろ thighBack、ひざ: knee）。待機・うれしいは しゃがみ（crouch）の形なので股・ひざは数えない
# 使い方: python3 gate6.py <キャラのフォルダ>
import json, sys, os
C = sys.argv[1]; cfg = json.load(open(os.path.join(C, 'config.json'))); L = json.load(open(os.path.join(C, 'work', 'stage5-log.json')))
P = cfg['range']['pass']; LIM = cfg['limits']; S = L['summary']; idle = S['idle']
th0, kn0 = idle['thigh'][0], min(a['kneeL'] for a in L['frames']['idle']['ang'])   # 立ち姿（待機の最初）の股・ひざ
band = dict(thigh=[round(th0 - 0.8 * LIM['thighBack'], 1), round(th0 + 0.8 * LIM['thighFwd'], 1)], knee_max=round(kn0 + 0.8 * LIM['knee'], 1))
chk = {}
for n, s in S.items():
    c = dict(stretch=s['stretch_max'] <= P['stretch_max'], shrink=s['shrink_min'] >= P['shrink_min'], folds=s['folds_max'] == 0, overlap=s['overlap_frames'] == 0,
             tail=P['tail_min'] <= s['tail_join'][0] and s['tail_join'][1] <= P['tail_max'], sole=s['stance_sole_mm'][1] <= 0.5 and s['stance_sole_mm'][0] >= -0.5,
             slip=s['slip_mm_per_frame'] is None or s['slip_mm_per_frame'][1] - s['slip_mm_per_frame'][0] <= 0.05, loop=L['loop_diff'][n] == 0)
    if n in ('walk', 'run'): c['limits'] = band['thigh'][0] <= s['thigh'][0] and s['thigh'][1] <= band['thigh'][1] and s['knee_max'] <= band['knee_max']
    chk[n] = c
out = dict(summary=S, loop_diff=L['loop_diff'], speed={n: L[n + '_speed'] for n in ('walk', 'run')}, export=L['export'], limits_band=band, check=chk,
           pass_=all(all(c.values()) for c in chk.values()),
           note='伸び・縮み・折り返し・めりこみ・しっぽのつなぎ目は立ち姿に対して。sole_mm = 足の裏の高さ（全コマ、mm・身長 1000）、stance_sole_mm = 着いている足だけ。slip = 着いている足首の 1 コマの前後の動き（一定 = すべらない）。limits_band = 歩き・走りの股（度。+ が前）・ひざの許す範囲（立ち姿 ＋ limits の 8 割）')
json.dump(out, open(os.path.join(C, 'gate', 'gate6.json'), 'w'), ensure_ascii=False, indent=1)
print('GATE6', 'pass' if out['pass_'] else 'FAIL', json.dumps(band), json.dumps({n: [k for k, v in c.items() if not v] for n, c in chk.items()}))
