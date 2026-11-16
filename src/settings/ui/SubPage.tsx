// 設定から開く全画面（規約・お問い合わせ・退会）の枠。設定と同じ「明るい昼の手帳」で、設定の上に重なる
import type { ReactNode } from 'react'
import './settings.css'
import { Icon } from '../../ui/Icon.tsx'

export function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <section className="st st--sub" aria-label={title}>
      <header className="st__bar">
        <button type="button" className="st__back" aria-label="戻る" onClick={onBack}>
          <Icon name="back" size={20} />
        </button>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  )
}
