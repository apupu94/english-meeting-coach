'use client';

import { useState, useRef } from 'react';

const SAMPLE_EN = `Jin: So, uh, basically what I want to say is that the feature is not ready yet because we have some technical issues. I think maybe we should push the deadline.
Sarah: What's the current status exactly?
Jin: The team is working very hard but the progress is, how to say, a bit slow. I feel like we need more time to finish everything properly.
Sarah: How much more time are we talking?
Jin: Maybe two more weeks? I'm not 100% sure but I think that should be enough. Actually I want to confirm with everyone here, do we have flexibility on the timeline or not?
Sarah: We can consider it. Send me a written update by Friday.
Jin: OK I will try to do that. Thank you for understanding.`;

const SAMPLE_ZH = `金：这个功能现在还没弄好，就是说技术上有点问题，我觉得可能需要再推迟一下。
莎拉：现在具体是什么情况？
金：团队都在努力做，但是进度的话，怎么说呢，就是有点慢。我感觉还需要一点时间才能搞完。
莎拉：大概还需要多久？
金：可能两周左右吧？我也不是很确定，就是感觉差不多够了。我想问一下大家，时间上有没有灵活性？
莎拉：可以考虑。周五之前发给我一个书面说明。
金：好的，我会尽量做到的，谢谢你的理解。`;

type Expression = {
  original: string;
  sentence: string;
  replacement: string;
  context: string;
  tip: string;
};

type Analysis = {
  speaker: string;
  theme: string;
  meeting: string | null;
  expressions: Expression[];
  takeaway: string;
};

type PageState = 'input' | 'loading' | 'result';
type Exporting = null | 'image' | 'pdf';
type Lang = 'en' | 'zh';

export default function Home() {
  const [state, setState] = useState<PageState>('input');
  const [transcript, setTranscript] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [exporting, setExporting] = useState<Exporting>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  /* ─── Submit ─────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!transcript.trim()) return;
    setState('loading');
    setError('');

    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, speaker, lang }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }

      const cleaned = fullText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed: Analysis = JSON.parse(cleaned);
      setAnalysis(parsed);
      setState('result');
    } catch {
      setError('分析失败，请稍后重试。');
      setState('input');
    }
  };

  /* ─── TTS ────────────────────────────────────────── */
  const handleSpeak = (text: string) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-GB';
    utter.rate = 0.88;
    utter.pitch = 0.85;
    const trySpeak = () => {
      const voices = synth.getVoices();
      const male = voices.find(v => /daniel|george|oliver|arthur|malcolm/i.test(v.name) && v.lang.startsWith('en-GB'))
        || voices.find(v => /google uk english male/i.test(v.name))
        || voices.find(v => v.lang === 'en-GB')
        || voices.find(v => v.lang.startsWith('en'));
      if (male) utter.voice = male;
      synth.speak(utter);
    };
    if (synth.getVoices().length) trySpeak();
    else { synth.onvoiceschanged = () => { trySpeak(); synth.onvoiceschanged = null; }; }
  };

  /* ─── Highlight sentence ─────────────────────────── */
  const renderSentence = (sentence: string, phrase: string) => {
    if (!sentence || !phrase) return <span style={s.originalText}>{sentence}</span>;
    const idx = sentence.toLowerCase().indexOf(phrase.toLowerCase());
    if (idx === -1) return <span style={s.originalText}>{sentence}</span>;
    return (
      <span style={s.originalText}>
        {sentence.slice(0, idx)}
        <mark style={s.highlight}>{sentence.slice(idx, idx + phrase.length)}</mark>
        {sentence.slice(idx + phrase.length)}
      </span>
    );
  };

  /* ─── Copy single ────────────────────────────────── */
  const handleCopy = (text: string, i: number) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 1800);
  };

  /* ─── Build upgraded sentence (frontend substitution) ── */
  const buildUpgraded = (e: Expression) => {
    const idx = e.sentence.toLowerCase().indexOf(e.original.toLowerCase());
    if (idx === -1) return e.sentence;
    return e.sentence.slice(0, idx) + e.replacement + e.sentence.slice(idx + e.original.length);
  };

  /* ─── Copy all ───────────────────────────────────── */
  const handleCopyAll = () => {
    if (!analysis) return;
    const lines = analysis.expressions
      .map(
        (e, i) =>
          `${i + 1}. ${e.context}\n   你说的: "${e.sentence}"\n   更好的: "${buildUpgraded(e)}"\n   建议: ${e.tip}`
      )
      .join('\n\n');
    const text = `${analysis.speaker} — ${analysis.theme}\n\n${lines}\n\n核心建议: ${analysis.takeaway}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  /* ─── CDN script loader ──────────────────────────── */
  const loadScript = (src: string): Promise<void> =>
    new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(el);
    });

  const getCanvas = async () => {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).html2canvas(resultRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
  };

  /* ─── Export image ───────────────────────────────── */
  const handleExportImage = async () => {
    if (!resultRef.current || exporting) return;
    setExporting('image');
    try {
      const canvas = await getCanvas();
      const link = document.createElement('a');
      link.download = `english-coach-${(analysis?.speaker || 'results').toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(null);
    }
  };

  /* ─── Export PDF ─────────────────────────────────── */
  const handleExportPDF = async () => {
    if (!resultRef.current || exporting) return;
    setExporting('pdf');
    try {
      const canvas = await getCanvas();
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { jsPDF } = (window as any).jspdf;
      const imgData = canvas.toDataURL('image/png');
      const pxW = canvas.width / 2;
      const pxH = canvas.height / 2;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [pxW, pxH] });
      pdf.addImage(imgData, 'PNG', 0, 0, pxW, pxH);
      pdf.save(`english-coach-${(analysis?.speaker || 'results').toLowerCase().replace(/\s+/g, '-')}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  /* ─── Loading ────────────────────────────────────── */
  if (state === 'loading') {
    return (
      <main style={s.main}>
        <div style={s.centerBox}>
          <div style={s.dots}>
            <span style={{ ...s.dot, animationDelay: '0s' }} />
            <span style={{ ...s.dot, animationDelay: '.2s' }} />
            <span style={{ ...s.dot, animationDelay: '.4s' }} />
          </div>
          <p style={s.loadingText}>正在分析你的会议记录…</p>
          <style>{dotAnim}</style>
        </div>
      </main>
    );
  }

  /* ─── Result ─────────────────────────────────────── */
  if (state === 'result' && analysis) {
    return (
      <main style={s.main}>
        <div style={s.container}>

          {/* Export area */}
          <div ref={resultRef} style={s.exportArea}>

            {/* Header */}
            <div style={s.resultHeader}>
              <div>
                {analysis.meeting && (
                  <div style={s.meetingLabel}>📋 {analysis.meeting}</div>
                )}
                <div style={s.speakerName}>{analysis.speaker}</div>
              </div>
              <div style={s.headerRight}>
                <span style={s.themePill}>{analysis.theme}</span>
              </div>
            </div>

            <h2 style={s.sectionTitle}>5 个表达升级</h2>

            {/* Cards */}
            <div style={s.cardList}>
              {analysis.expressions.map((expr, i) => (
                <div key={i} style={s.card}>
                  <div style={s.cardContext}>{expr.context}</div>
                  <div style={s.cardBody}>
                    <div style={s.colLeft}>
                      <div style={s.colLabel}>你说的</div>
                      {renderSentence(expr.sentence || expr.original, expr.original)}
                    </div>
                    <div style={s.arrowCol}>→</div>
                    <div style={s.colRight}>
                      <div style={s.colLabelRow}>
                        <span style={s.colLabel}>更好的说法</span>
                        <button
                          style={s.speakBtn}
                          onClick={() => handleSpeak(buildUpgraded(expr))}
                          title="点击收听（英式英语）"
                        >🔊</button>
                      </div>
                      <p style={s.upgradedText}>"{buildUpgraded(expr)}"</p>
                    </div>
                  </div>
                  <div style={s.cardFooter}>
                    <span style={s.tipText}>💡 {expr.tip}</span>
                    <button
                      style={copied === i ? s.copiedBtn : s.copyBtn}
                      onClick={() => handleCopy(buildUpgraded(expr), i)}
                    >
                      {copied === i ? '✓ 已复制' : '复制'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Takeaway */}
            <div style={s.takeaway}>
              <span style={s.takeawayLabel}>核心建议</span>
              <p style={s.takeawayText}>{analysis.takeaway}</p>
            </div>

          </div>{/* end exportArea */}

          {/* Action bar */}
          <div style={s.actionBar}>
            <button style={s.secondaryBtn} onClick={() => { setState('input'); setAnalysis(null); }}>
              ← 重新分析
            </button>
            <div style={s.exportBtns}>
              <button style={copiedAll ? s.copiedBtn : s.outlineBtn} onClick={handleCopyAll}>
                {copiedAll ? '✓ 已复制！' : '📋 复制全部'}
              </button>
              <button
                style={exporting === 'image' ? s.disabledBtn : s.outlineBtn}
                onClick={handleExportImage}
                disabled={!!exporting}
              >
                {exporting === 'image' ? '保存中…' : '🖼 保存图片'}
              </button>
              <button
                style={exporting === 'pdf' ? s.disabledBtn : s.outlineBtn}
                onClick={handleExportPDF}
                disabled={!!exporting}
              >
                {exporting === 'pdf' ? '保存中…' : '📄 保存 PDF'}
              </button>
            </div>
          </div>

        </div>
      </main>
    );
  }

  /* ─── Input ──────────────────────────────────────── */
  return (
    <main style={s.main}>
      <div style={s.container}>
        <div style={s.hero}>
          <h1 style={s.title}>会后5分钟</h1>
          <p style={s.tagline}>粘贴会议记录，获取你专属的 5 个表达升级建议</p>
        </div>

        <div style={s.langToggle}>
          <button
            style={lang === 'en' ? s.langBtnActive : s.langBtn}
            onClick={() => setLang('en')}
          >🇬🇧 英语模式</button>
          <button
            style={lang === 'zh' ? s.langBtnActive : s.langBtn}
            onClick={() => setLang('zh')}
          >🇨🇳 普通话模式</button>
        </div>

        <div style={s.form}>
          <label style={s.label}>会议记录 *</label>
          <textarea
            style={s.bigTextarea}
            placeholder="把会议记录粘贴到这里…"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />

          <label style={{ ...s.label, marginTop: 20 }}>你在会议中叫什么？</label>
          <p style={s.guidance}>
            告诉我你的名字或称呼，我只分析你的表达 — 例如 <em>Jin</em>、<em>Speaker 3</em>、<em>Sarah</em>。留空则自动分析主要发言者。
          </p>
          <input
            style={s.speakerInput}
            placeholder="例如：Jin、Speaker 3、Sarah…"
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
          />

          {error && <p style={s.error}>{error}</p>}

          <div style={s.actionRow}>
            <button style={s.secondaryBtn} onClick={() => {
              if (lang === 'en') { setTranscript(SAMPLE_EN); setSpeaker('Jin'); }
              else { setTranscript(SAMPLE_ZH); setSpeaker('金'); }
            }}>
              加载示例
            </button>
            <button
              style={transcript.trim() ? s.primaryBtn : s.primaryBtnDisabled}
              onClick={handleSubmit}
              disabled={!transcript.trim()}
            >
              {lang === 'en' ? '分析我的英语 →' : '分析我的普通话 →'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ─── Dot animation ──────────────────────────────────── */
const dotAnim = `
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: .35; }
  40% { transform: translateY(-10px); opacity: 1; }
}`;

/* ─── Styles ─────────────────────────────────────────── */
const s: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    background: '#fafafa',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '48px 16px 80px',
  },
  container: { width: '100%', maxWidth: 780 },
  centerBox: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { display: 'flex', gap: 8 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#999',
    display: 'inline-block',
    animation: 'bounce 1.2s infinite ease-in-out',
  },
  loadingText: { marginTop: 20, color: '#666', fontSize: 15 },

  /* input screen */
  hero: { marginBottom: 32 },
  title: { fontSize: 32, fontWeight: 700, color: '#111', margin: '0 0 8px', letterSpacing: '-0.5px' },
  tagline: { fontSize: 15, color: '#666', margin: 0 },
  form: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 4 },
  guidance: { fontSize: 12, color: '#888', margin: '0 0 8px', lineHeight: 1.5 },
  bigTextarea: {
    width: '100%',
    minHeight: 200,
    padding: '12px 14px',
    fontSize: 14,
    lineHeight: 1.6,
    border: '1.5px solid #e0e0e0',
    borderRadius: 8,
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    color: '#111',
    background: '#fff',
  },
  speakerInput: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    border: '1.5px solid #e0e0e0',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    color: '#111',
    background: '#fff',
  },
  error: { color: '#dc2626', fontSize: 13, marginTop: 10, marginBottom: 0 },
  actionRow: { display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' },

  /* result screen */
  exportArea: { background: '#fff', borderRadius: 12, padding: '28px 28px 24px', border: '1px solid #e5e7eb', marginBottom: 16 },
  resultHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  speakerName: { fontSize: 22, fontWeight: 700, color: '#111', letterSpacing: '-0.4px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  themePill: { background: '#f3f4f6', color: '#374151', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600 },
  langToggle: { display: 'flex', gap: 8, marginBottom: 24 },
  langBtn: { padding: '8px 18px', background: '#fff', color: '#6b7280', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  langBtnActive: { padding: '8px 18px', background: '#111', color: '#fff', border: '1.5px solid #111', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#111', margin: '0 0 14px' },

  /* cards */
  cardList: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 },
  card: { border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' },
  cardContext: {
    background: '#f8f9fa',
    borderBottom: '1px solid #e5e7eb',
    padding: '7px 16px',
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  cardBody: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 0,
  },
  colLeft: {
    flex: 1,
    padding: '14px 16px',
    borderRight: '1px solid #f0f0f0',
  },
  arrowCol: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    fontSize: 18,
    color: '#d1d5db',
    flexShrink: 0,
  },
  colRight: {
    flex: 1,
    padding: '14px 16px',
  },
  meetingLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  colLabel: { fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.6px', marginBottom: 6, textTransform: 'uppercase' as const },
  colLabelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  originalText: { margin: 0, fontSize: 13, color: '#9ca3af', lineHeight: 1.6 },
  highlight: { background: '#fef08a', color: '#713f12', borderRadius: 3, padding: '1px 2px', textDecoration: 'none', fontWeight: 600 },
  upgradedText: { margin: 0, fontSize: 13, color: '#16a34a', fontWeight: 600, lineHeight: 1.6 },
  speakBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1, opacity: 0.7 },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderTop: '1px solid #f3f4f6',
    background: '#fafafa',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  tipText: { fontSize: 12, color: '#6b7280', flex: 1 },

  /* takeaway */
  takeaway: { background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '14px 18px' },
  takeawayLabel: { fontSize: 10, fontWeight: 700, color: '#92400e', letterSpacing: '0.6px', marginBottom: 6, display: 'block', textTransform: 'uppercase' as const },
  takeawayText: { margin: 0, fontSize: 13, color: '#451a03', lineHeight: 1.6, fontStyle: 'italic' },

  /* action bar */
  actionBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 },
  exportBtns: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },

  /* buttons */
  primaryBtn: { padding: '10px 20px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  primaryBtnDisabled: { padding: '10px 20px', background: '#d1d5db', color: '#9ca3af', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'not-allowed' },
  secondaryBtn: { padding: '9px 18px', background: '#fff', color: '#333', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  outlineBtn: { padding: '8px 14px', background: '#fff', color: '#374151', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  disabledBtn: { padding: '8px 14px', background: '#f3f4f6', color: '#9ca3af', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'not-allowed' },
  copyBtn: { padding: '3px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  copiedBtn: { padding: '3px 10px', fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', borderRadius: 5, cursor: 'default', whiteSpace: 'nowrap' as const },
};
