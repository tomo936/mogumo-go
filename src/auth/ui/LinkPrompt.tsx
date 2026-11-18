// ゲストに Google をつなぐよう勧める小さな窓（ポコタン）。節目・感想を書こうとしたとき・つなげなかったとき（A3）
import './linkPrompt.css'
import pokoStill from '../../assets/guide/poko.webp'

type Props = {
  title: string
  text: string
  okLabel: string
  cancelLabel: string
  danger?: boolean // 押すと何かが消えるとき（赤いボタン）
  busy?: boolean
  onOk: () => void
  onCancel: () => void
}

export function LinkPrompt({ title, text, okLabel, cancelLabel, danger, busy, onOk, onCancel }: Props) {
  return (
    <div className="lp" role="dialog" aria-label={title}>
      <div className="lp__wrap">
        {/* 絵は下が切れているので、窓の上の線の後ろに隠して顔を出す（案内 guide.css と同じ） */}
        <img className="lp__poko" src={pokoStill} alt="" />
        <div className="lp__box">
          <b>{title}</b>
          <p>{text}</p>
          <button type="button" className={danger ? 'lp__ok is-danger' : 'lp__ok'} disabled={busy} onClick={onOk}>
            {busy ? '少し待ってね…' : okLabel}
          </button>
          <button type="button" className="lp__cancel" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
