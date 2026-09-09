export const pvReportStyles = `
    :root {
      --wn-green: #4E8D3E;
      --wn-green-dark: #2F5F33;
      --wn-green-soft: #EEF7EA;
      --wn-bg: #F7F9F5;
      --wn-card: #FFFFFF;
      --wn-text: #232323;
      --wn-muted: #7A7F78;
      --wn-border: #E4E9E1;
      --wn-warning: #F5B83D;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Arial, Calibri, sans-serif;
      color: var(--wn-text);
      background: var(--wn-bg);
      line-height: 1.5;
    }
    .page { max-width: 1180px; margin: 0 auto; padding: 28px; }
    .header {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr) minmax(300px, .72fr);
      gap: 28px;
      align-items: stretch;
      overflow: hidden;
      border-radius: 28px;
      padding: 34px;
      background:
        radial-gradient(circle at 90% 10%, rgba(255,255,255,.18), transparent 28%),
        linear-gradient(135deg, var(--wn-green-dark) 0%, #3D7C37 58%, var(--wn-green) 100%);
      color: #fff;
      box-shadow: 0 24px 60px rgba(47,95,51,.22);
    }
    .brand { align-self: center; }
    .brand h1 { margin: 0; font-size: 38px; line-height: 1.08; letter-spacing: 0; }
    .brand p { max-width: 680px; margin: 14px 0 0; color: rgba(255,255,255,.86); font-size: 16px; }
    .hero {
      overflow: hidden;
      border-radius: 28px;
      background:
        radial-gradient(circle at 90% 10%, rgba(255,255,255,.18), transparent 28%),
        linear-gradient(135deg, var(--wn-green-dark) 0%, #3D7C37 58%, var(--wn-green) 100%);
      color: #fff;
      box-shadow: 0 24px 60px rgba(47,95,51,.22);
    }
    .hero-inner {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr);
      gap: 28px;
      align-items: stretch;
      padding: 34px;
    }
    .logoWrap {
      width: 210px;
      min-height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 7px 10px;
      border: 1px solid rgba(255,255,255,.35);
      border-radius: 14px;
      background: rgba(255,255,255,.12);
    }
    .logoWrap img { max-width: 190px; max-height: 48px; }
    .logoFallback { display: none; color: #fff; font-weight: 700; }
    .eyebrow {
      margin-top: 28px;
      color: rgba(255,255,255,.78);
      font-size: 10px;
      letter-spacing: .18em;
      text-transform: uppercase;
      font-weight: 700;
    }
    h1 { margin: 8px 0 0; font-size: 38px; line-height: 1.08; letter-spacing: 0; }
    .hero-subtitle { max-width: 720px; margin: 14px 0 0; color: rgba(255,255,255,.86); font-size: 16px; }
    .advice-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 260px;
      padding: 24px;
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 24px;
      background: rgba(255,255,255,.13);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.16);
      backdrop-filter: blur(6px);
    }
    .advice-label {
      width: fit-content;
      padding: 7px 11px;
      border-radius: 999px;
      background: rgba(255,255,255,.18);
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .advice-title { margin-top: 18px; font-size: 24px; line-height: 1.18; font-weight: 800; }
    .advice-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 22px; }
    .advice-metric { border-top: 1px solid rgba(255,255,255,.24); padding-top: 12px; }
    .advice-metric span { display: block; color: rgba(255,255,255,.7); font-size: 10px; }
    .advice-metric strong { display: block; margin-top: 3px; font-size: 18px; }
    .grid { display: grid; gap: 18px; margin-top: 18px; }
    .grid.kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .grid.two { grid-template-columns: minmax(0, 1.18fr) minmax(320px, .82fr); }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .card {
      background: var(--wn-card);
      border: 1px solid var(--wn-border);
      border-radius: 20px;
      padding: 22px;
      box-shadow: 0 14px 36px rgba(47,95,51,.08);
    }
    .section-title { margin: 0 0 6px; font-size: 20px; line-height: 1.2; color: var(--wn-text); }
    .section-intro { margin: 0 0 16px; color: var(--wn-muted); font-size: 12.5px; }
    .kpi-card { min-height: 112px; padding: 18px; }
    .kpi-label { color: var(--wn-muted); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .kpi-value { margin-top: 10px; font-weight: 800; font-size: 16px; color: var(--wn-text); line-height: 1.25; }
    .plot { width: 100%; height: 330px; }
    .plot.tall { height: 380px; }
    .brochureFrame { width: 100%; height: 420px; border: 1px solid var(--wn-border); border-radius: 16px; background: #fff; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 11.5px; color: var(--wn-text); overflow: hidden; border-radius: 14px; border: 1px solid var(--wn-border); }
    th, td { border-bottom: 1px solid var(--wn-border); padding: 12px 14px; text-align: left; vertical-align: top; }
    th { background: var(--wn-green-soft); color: var(--wn-green-dark); font-weight: 800; }
    td strong, tbody tr td:nth-child(2) { font-weight: 700; }
    tbody tr:nth-child(even) td { background: #FBFCFA; }
    tbody tr:last-child td { border-bottom: none; }
    .muted { color: var(--wn-muted); font-size: 10.5px; line-height: 1.45; margin-top: 8px; }
    .callout {
      background: var(--wn-green-soft);
      border: 1px solid #D6E8D0;
      border-left: 5px solid var(--wn-green);
      border-radius: 16px;
      padding: 14px 16px;
      margin-top: 14px;
      font-size: 12px;
      color: #315536;
    }
    .warning {
      background: #FFF8E8;
      border-color: #F6E4B5;
      border-left-color: var(--wn-warning);
      color: #594214;
    }
    .scenario-card { position: relative; min-height: 185px; }
    .scenario-card.recommended {
      border-color: rgba(78,141,62,.45);
      box-shadow: 0 18px 44px rgba(78,141,62,.18);
      transform: translateY(-4px);
    }
    .scenario-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--wn-green-soft);
      color: var(--wn-green-dark);
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .scenario-card.recommended .scenario-pill { background: var(--wn-green); color: #fff; }
    .scenario-title { margin: 14px 0 4px; font-size: 22px; font-weight: 800; color: var(--wn-green-dark); }
    .scenario-list { display: grid; gap: 8px; margin-top: 14px; color: var(--wn-muted); font-size: 11px; }
    .conclusion-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 12px; }
    .conclusion-item { border-radius: 16px; background: rgba(255,255,255,.72); padding: 14px; }
    .conclusion-item strong { display: block; margin-bottom: 6px; color: var(--wn-green-dark); }
    .steps { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
    .step { position: relative; min-height: 118px; border: 1px solid var(--wn-border); border-radius: 16px; padding: 14px; background: #fff; }
    .step-number { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; background: var(--wn-green); color: #fff; font-weight: 800; font-size: 12px; }
    .step-title { margin-top: 12px; font-size: 12px; font-weight: 800; color: var(--wn-green-dark); }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--wn-border); display: flex; justify-content: space-between; gap: 12px; color: var(--wn-muted); font-size: 10px; }
    @media (max-width: 980px) {
      .hero-inner, .grid.two, .grid.three { grid-template-columns: 1fr; }
      .grid.kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .steps, .conclusion-grid { grid-template-columns: 1fr 1fr; }
      h1 { font-size: 30px; }
    }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 14mm; }
      .hero { box-shadow: none; border-radius: 18px; }
      .hero-inner { padding: 20px; grid-template-columns: 1.1fr .9fr; }
      h1 { font-size: 26px; }
      .card, .kpi-card, .scenario-card, .step { box-shadow: none; page-break-inside: avoid; break-inside: avoid; }
      .grid { gap: 12px; margin-top: 12px; }
      .plot { height: 260px; }
      .brochureFrame { height: 320px; }
      table, .plot { page-break-inside: avoid; break-inside: avoid; }
      .footer { display: flex; }
    }
  `;
