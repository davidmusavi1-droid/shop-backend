'use strict';

const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { fail, invalid } = require('./validation');

const subjectKey = brand => brand.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const missingBrand = brand => /^(?:(?:برند[\s‌]+)?نامشخص|(?:فاقد|بدون)[\s‌]*(?:برند(?: مشخص)?|لیبل).*|unknown|unbranded|no (?:brand|label)|[-—]+)?$/iu.test(subjectKey(brand));
const isNorthFace = brand => subjectKey(brand) === 'the north face';
const stale = () => fail(409, 'RESEARCH_STALE', 'اطلاعات مبنای پیشنهاد تغییر کرده است. ابتدا نتیجه یا پیشنهاد تازه را بررسی کنید.');

const officialHosts = new Map([
  ['the north face', ['thenorthface.com', 'www.thenorthface.com']],
  ['puma', ['puma.com', 'www.puma.com', 'about.puma.com']],
  ['puma ag', ['puma.com', 'www.puma.com', 'about.puma.com']],
]);
const pumaVolvoSource = 'https://www.volvocars.com/intl/media/press-releases/2903CB8F0C3A8BFF/';

function checkResearchSubject(fields, labelConfirmed, live) {
  if (missingBrand(fields.brand) || labelConfirmed !== true) {
    throw fail(422, 'BRAND_LABEL_REQUIRED', 'تحقیق فقط برای برند مشخص و خوانده‌شده از لیبل با تأیید مدیر انجام می‌شود.');
  }
  if (fields.styleNumber && fields.styleConfirmed !== true) {
    throw fail(422, 'STYLE_CONFIRMATION_REQUIRED', 'شمارهٔ استایل را تأیید کنید یا آن را خالی بگذارید.');
  }
  if (live && !officialHosts.has(subjectKey(fields.brand))) {
    throw fail(422, 'BRAND_SOURCE_POLICY_REQUIRED', 'دامنهٔ رسمی این برند هنوز در سیاست منابع ثبت نشده است.');
  }
}

function httpsSource(value, brand, section) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    url.hash = '';
    const key = subjectKey(brand);
    const official = officialHosts.get(key)?.includes(url.hostname);
    const partner = (key === 'puma' || key === 'puma ag') && section === 'design' && url.href === pumaVolvoSource;
    return official || partner ? url.href : null;
  } catch { return null; }
}

function mockFinding(brand) {
  const retrievedAt = new Date().toISOString();
  return isNorthFace(brand) ? {
    claim: 'طبق تاریخچهٔ رسمی، The North Face در سال ۱۹۶۶ از یک فروشگاه کوچک در سان‌فرانسیسکو آغاز شد.',
    url: 'https://www.thenorthface.com/en-us/about-us/our-story',
    title: 'The North Face | Our Story',
    evidence: 'بخش 1966 در تاریخچهٔ برند به آغاز کار در یک فروشگاه کوچک در سان‌فرانسیسکو اشاره می‌کند.',
    design: {
      claim: 'به روایت رسمی برند، تجربهٔ کاوش در فضای باز الهام‌بخش طراحی تجهیزات آن است.',
      url: 'https://www.thenorthface.com/en-us/about-us/our-story',
      title: 'The North Face | Our Story',
      evidence: 'در مقدمهٔ تاریخچه، برند توضیح می‌دهد که سفرهای اکتشافی به آزمودن مرزهای عملکرد الهام می‌دهند.',
    },
    retrievedAt, checkedAt: null, status: 'pending_source_review',
  } : { status: 'no_source', retrievedAt };
}

const knownTypes = ['بادگیر', 'کاپشن', 'شلوار', 'سویشرت', 'پیراهن', 'تی‌شرت'];
const knownDesign = ['زیپ‌دار', 'نیم‌زیپ', 'کلاه‌دار', 'یقه‌گرد', 'جیب‌دار'];
const knownClosures = ['زیپ کامل', 'نیم‌زیپ', 'دکمه', 'جلو بسته', 'بندی'];
const suggestedUses = { روزمره: 'پوشش روزمره', ورزشی: 'فعالیت ورزشی', 'مناسب کار': 'محیط کار', سفر: 'سفر' };

function basis(fields) {
  return {
    type: knownTypes.includes(fields.type) ? fields.type : '',
    closure: knownClosures.includes(fields.closure) ? fields.closure : '',
    design: knownDesign.filter(value => fields.design.includes(value)),
    uses: Object.keys(suggestedUses).filter(value => fields.uses.includes(value)),
  };
}

function brandResearchState(fields, finding, mode, id) {
  const claims = Object.fromEntries(['design', 'style'].flatMap(key => finding[key]
    ? [[key, { ...finding[key], status: finding.status, checkedAt: finding.checkedAt }]] : []));
  return { kind: 'brand', id, mode, brand: fields.brand, styleNumber: fields.styleNumber || '',
    subjectRevision: fields.researchSubjectRevision || null, finding: { ...finding, ...claims }, draft: null };
}

function sameSubject(research, fields) {
  return research?.kind === 'brand' && subjectKey(research.brand) === subjectKey(fields.brand) &&
    (research.styleNumber || '') === (fields.styleNumber || '') &&
    (!fields.styleNumber || fields.styleConfirmed === true) &&
    (research.subjectRevision || null) === (fields.researchSubjectRevision || null);
}

function validEvidence(claim) {
  return typeof claim?.claim === 'string' && claim.claim.trim() &&
    typeof claim.evidence === 'string' && claim.evidence.trim();
}

function displayResearch(fields) {
  const { research } = fields;
  if (research?.kind !== 'brand') return research;
  const current = sameSubject(research, fields);
  const { draft } = research;
  const finding = { ...research.finding };
  if (finding.status !== 'no_source') {
    const url = httpsSource(finding.url, research.brand, 'identity');
    const validSource = url && typeof finding.title === 'string' && finding.title.trim();
    finding.url = validSource ? url : null;
    if (!validSource || !validEvidence(finding)) finding.status = 'invalid_source';
    if (finding.design) {
      finding.design = {
        status: research.finding.status, checkedAt: research.finding.checkedAt, ...finding.design,
      };
      const legacy = !Object.hasOwn(research, 'subjectRevision');
      const designUrl = httpsSource(legacy ? finding.design.url ?? finding.url : finding.design.url,
        research.brand, 'design');
      finding.design.title = legacy ? finding.design.title ?? finding.title : finding.design.title;
      finding.design.url = designUrl && typeof finding.design.title === 'string' && finding.design.title.trim() ? designUrl : null;
      if (!finding.design.url || !validEvidence(finding.design)) finding.design.status = 'invalid_source';
    }
  }
  if (finding.style) {
    const url = httpsSource(finding.style.url, research.brand, 'style');
    const validStyle = url && typeof finding.style.title === 'string' && finding.style.title.trim() &&
      research.styleNumber && validEvidence(finding.style) && finding.style.evidence.includes(research.styleNumber);
    finding.style = { ...finding.style, url: validStyle ? url : null,
      status: validStyle ? finding.style.status : 'invalid_source' };
  }
  return { ...research, finding,
    draft: draft && { id: research.id, decisions: ['pending', 'pending', 'pending'],
      transferred: [false, false, false], ...draft },
    current, draftCurrent: current && Boolean(draft) && isDeepStrictEqual(draft.basis, basis(fields)) };
}

function changeDraft(fields, edit) {
  const research = displayResearch(fields);
  const draft = research?.draft;
  if (!research?.draftCurrent || draft.status !== 'pending' || !edit || draft.id !== edit.id) throw stale();
  if (!Array.isArray(edit.sections) || edit.sections.length !== 3 ||
      edit.sections.some(text => typeof text !== 'string' || text.length > 4000 || text.includes('\u0000'))) {
    throw invalid('متن پیش‌نویس سه‌بخشی نامعتبر است.');
  }
  const sections = edit.sections.map(text => text.trim());
  const decisions = draft.decisions.map((decision, index) => {
    if (sections[index] === draft.sections[index]) return decision;
    if (draft.transferred[index] || (index === 0 && research.finding.status !== 'manager_verified')) throw stale();
    return 'pending';
  });
  return { ...fields, research: { ...fields.research, draft: { ...draft, sections, decisions } } };
}

const closureText = { 'زیپ کامل': 'زیپ سرتاسری دارد', 'نیم‌زیپ': 'با نیم‌زیپ باز و بسته می‌شود',
  دکمه: 'با دکمه بسته می‌شود', 'جلو بسته': 'جلو بسته است', بندی: 'با بند بسته می‌شود' };

function buildSections(input, finding) {
  const closure = closureText[input.closure];
  const details = input.design.filter(value =>
    !((['زیپ کامل', 'نیم‌زیپ'].includes(input.closure)) && ['زیپ‌دار', 'نیم‌زیپ'].includes(value)));
  const traits = details.length ? details.join(' و ') + ' است' : '';
  const description = [closure, traits].filter(Boolean).join(' و ');
  const design = finding.design?.status === 'manager_verified' ? finding.design.claim : '';
  const use = input.uses.map(value => suggestedUses[value]);
  return [
    finding.status === 'manager_verified' ? finding.claim : '',
    [design, description ? 'این ' + input.type + ' ' + description + '.' : 'نوع پوشاک ' + input.type + ' است.'].filter(Boolean).join('\n'),
    use.length ? 'برای ' + use.join(' و ') + ' پیشنهاد می‌شود.' : 'می‌توانید این ' + input.type + ' را با لباس‌های روزمره ست کنید.',
  ];
}

function researchAction(fields, action, { claim = 'identity', index, decision } = {}) {
  const research = displayResearch(fields);
  if (!research?.current) throw stale();
  const { finding, draft, draftCurrent } = research;
  const record = fields.research;
  const updateDraft = next => ({ ...fields, research: { ...record, draft: next } });

  if (['verify-source', 'reject-source'].includes(action)) {
    if (!['identity', 'design', 'style'].includes(claim)) throw invalid('ادعای انتخاب‌شده نامعتبر است.');
    const selected = claim === 'identity' ? finding : finding[claim];
    if (selected?.status !== 'pending_source_review') throw stale();
    const reviewed = { ...selected, status: action === 'verify-source' ? 'manager_verified' : 'rejected',
      checkedAt: new Date().toISOString() };
    return { ...fields, research: { ...record, draft: null, finding:
      claim === 'identity' ? reviewed : { ...finding, [claim]: reviewed } } };
  }

  if (action === 'generate') {
    if ([finding.status, finding.design?.status, finding.style?.status].includes('pending_source_review')) {
      throw invalid('ابتدا دربارهٔ هر ادعا پس از بررسی منبع تصمیم بگیرید.');
    }
    if (draftCurrent && draft.status !== 'rejected') return fields;
    const input = basis(fields);
    if (!input.type) throw invalid('ابتدا نوع پوشاک را در پرونده ثبت و بررسی کنید.');
    return updateDraft({ id: randomUUID(), basis: input, sections: buildSections(input, finding),
      status: 'pending', decisions: ['pending', 'pending', 'pending'], transferred: [false, false, false] });
  }

  if (!draftCurrent || draft.status !== 'pending') throw stale();
  if (action === 'review-draft') {
    if (![0, 1, 2].includes(index) || !['approved', 'rejected'].includes(decision)) {
      throw invalid('تصمیم بازبینی نامعتبر است.');
    }
    if (draft.transferred[index]) throw stale();
    if (decision === 'approved' && (!draft.sections[index].trim() ||
        (index === 0 && finding.status !== 'manager_verified'))) throw invalid('متن قابل تأیید نیست.');
    if (draft.decisions[index] === decision) return fields;
    const decisions = [...draft.decisions];
    decisions[index] = decision;
    return updateDraft({ ...draft, decisions });
  }
  if (action === 'reject-draft') {
    if (draft.transferred.some(Boolean)) throw stale();
    return updateDraft({ ...draft, status: 'rejected' });
  }
  const transferred = [...draft.transferred];
  const content = fields.content.map((item, i) => {
    if (item.text.trim() || transferred[i] || draft.decisions[i] !== 'approved' || !draft.sections[i] ||
        (i === 0 && finding.status !== 'manager_verified')) return item;
    transferred[i] = true;
    return { text: draft.sections[i], approved: true };
  });
  if (content.every((item, i) => item === fields.content[i])) {
    throw invalid('بخش تأییدشده‌ای برای انتقال به خانه‌های خالی وجود ندارد.');
  }
  return { ...updateDraft({ ...draft, transferred }), content };
}

module.exports = { checkResearchSubject, mockFinding, brandResearchState,
  sameSubject, displayResearch, researchAction, changeDraft, httpsSource };
