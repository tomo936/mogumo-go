// プライバシーポリシー・利用規約の画面（設定から開く。ログイン前は /privacy・/terms の道から）
import './legal.css'
import { SubPage } from '../../settings/ui/SubPage.tsx'
import { PrivacyPolicy } from './PrivacyPolicy.tsx'
import { Terms } from './Terms.tsx'

export type LegalKind = 'privacy' | 'terms'
const LEGAL_TITLE: Record<LegalKind, string> = { privacy: 'プライバシーポリシー', terms: '利用規約' }

export function LegalScreen({ kind, onClose }: { kind: LegalKind; onClose: () => void }) {
  return (
    <SubPage title={LEGAL_TITLE[kind]} onBack={onClose}>
      <article className="lg">{kind === 'privacy' ? <PrivacyPolicy /> : <Terms />}</article>
    </SubPage>
  )
}
