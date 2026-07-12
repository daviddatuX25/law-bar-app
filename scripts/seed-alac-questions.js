/**
 * seed-alac-questions.js
 * Seeds high-quality, disguised bar-exam-style ALAC questions grounded
 * in actual flashcards from the database.
 *
 * Strategy:
 * - Each question is a realistic scenario-based problem (not a "what is X?" question).
 * - Questions are multi-issue where possible, testing 1-2 cards simultaneously.
 * - Scenarios use Filipino names, Philippine settings, and bar exam language.
 * - Designed to disguise the underlying legal concept (student must spot the issue).
 */

const { DbAdapter } = require('../db.js');
const { randomUUID } = require('crypto');

const db = new DbAdapter('./bar_exam.db');
db.initialize();

// ---------------------------------------------------------------------------
// QUESTION BANK
// Each entry: { subject_id, question_text, flashcard_ids: [string] }
// ---------------------------------------------------------------------------
const QUESTIONS = [

  // =========================================================================
  // CIVIL LAW — 2 questions
  // =========================================================================
  {
    subject_id: 'civil-law',
    question_text:
      'Pedro owned a parcel of land in Quezon City. In January 2020, he sold ' +
      'it to Juan via a notarized deed of sale; Juan paid the full price but ' +
      'did not register the deed. In December 2020, Pedro sold the same lot ' +
      'to Maria, who had no knowledge of the prior sale to Juan. Maria ' +
      'registered her deed one week later. (a) Who has the better right to ' +
      'the property? (b) Would your answer change if Maria knew of Juan\'s ' +
      'prior sale before she registered? Explain fully.',
    flashcard_ids: ['civil-1'], // Art. 1544 Double Sale
  },
  {
    subject_id: 'civil-law',
    question_text:
      'Spouses Mario and Elena, married under the Family Code, have two ' +
      'legitimate children, Carlo and Diana, and one illegitimate child, ' +
      'Ernesto. Mario died intestate leaving a net estate of ₱1,200,000. ' +
      'Elena survives him. (a) Who are Mario\'s compulsory heirs and what ' +
      'are their respective legitimes? (b) Assuming Mario executed a will ' +
      'leaving his entire estate to his favorite nephew and nothing to his ' +
      'compulsory heirs — what is the effect of such testamentary disposition ' +
      'on the legitime? Explain the concept that governs.',
    flashcard_ids: ['civil-20'], // Art. 886/887 Legitime
  },

  // =========================================================================
  // CRIMINAL LAW — 2 questions
  // =========================================================================
  {
    subject_id: 'criminal-law',
    question_text:
      'Rodrigo, while driving his car at 90 km/h in a 60 km/h school zone, ' +
      'lost control of the vehicle and struck a pedestrian, Luz, who died ' +
      'on the spot. The defense argues that Rodrigo had no intent to kill ' +
      'Luz. The prosecution charges reckless imprudence resulting in ' +
      'homicide. (a) Distinguish between a felony committed with dolo and ' +
      'one committed with culpa. (b) Is the charge proper? What are the ' +
      'elements the prosecution must prove? Explain.',
    flashcard_ids: ['crim-1', 'crim-2'], // Art. 3&4 Dolo + Art. 365 Culpa
  },
  {
    subject_id: 'criminal-law',
    question_text:
      'Bong entered a stranger\'s house after dark and fatally stabbed the ' +
      'owner. At trial, Bong invoked self-defense, claiming the owner ' +
      'attacked him first with a bolo, and that he used only a kitchen ' +
      'knife found on the table to retaliate. (a) What are the elements of ' +
      'self-defense that Bong must establish? (b) Discuss the burden of ' +
      'proof and how unlawful aggression — the most important element — is ' +
      'assessed in this scenario.',
    flashcard_ids: ['crim-15'], // Art. 11 Justifying Circumstances
  },

  // =========================================================================
  // POLITICAL LAW — 2 questions
  // =========================================================================
  {
    subject_id: 'political-law',
    question_text:
      'Congress passed Republic Act 12345 requiring all government employees ' +
      'to undergo mandatory drug testing and authorizing the immediate ' +
      'dismissal of those who test positive, without a formal hearing. ' +
      'An employee dismissed under this law challenges it before the Supreme ' +
      'Court. (a) Identify and discuss the constitutional right(s) under the ' +
      'Bill of Rights that may be violated. (b) Apply the relevant standard ' +
      'of judicial review. Will the challenge likely succeed? Explain.',
    flashcard_ids: ['poli-1'], // Art. III Bill of Rights
  },
  {
    subject_id: 'political-law',
    question_text:
      'A journalist filed a petition to compel the Office of the President ' +
      'to release intelligence fund disbursement records for the past three ' +
      'fiscal years, invoking the constitutional right to information. The ' +
      'Office refused, citing national security and executive privilege. ' +
      '(a) State the constitutional basis for the right to information. ' +
      '(b) Is the refusal justified? Discuss what information may be withheld ' +
      'and the limits of executive privilege in light of the right to ' +
      'information on matters of public concern.',
    flashcard_ids: ['poli-12'], // Art. III Sec. 7 Right to Info
  },

  // =========================================================================
  // COMMERCIAL LAW — 2 questions
  // =========================================================================
  {
    subject_id: 'commercial-law',
    question_text:
      'ABC Corporation is a holding company wholly owned by Eduardo. Eduardo ' +
      'uses ABC Corporation\'s bank account for personal expenses, mixes ' +
      'corporate and personal funds, and never holds board meetings. When ' +
      'ABC Corporation defaults on a loan to BDO Bank, BDO Bank seeks to ' +
      'hold Eduardo personally liable. (a) What doctrine is BDO invoking? ' +
      '(b) What must BDO prove to pierce the corporate veil and hold Eduardo ' +
      'personally liable? Discuss the grounds recognized under Philippine ' +
      'corporate law.',
    flashcard_ids: ['comm-1'], // Separate juridical entity / piercing
  },
  {
    subject_id: 'commercial-law',
    question_text:
      'Francisco subscribed to 10,000 shares of XYZ Corporation at ₱10 per ' +
      'share for a total subscription price of ₱100,000. He paid ₱25,000 ' +
      'upon subscription. When the corporation called for the remaining ' +
      'balance, Francisco refused to pay, claiming the corporation had been ' +
      'performing poorly. The board resolved to forfeit his subscription. ' +
      '(a) Is Francisco\'s subscription contract valid and binding? (b) May ' +
      'the corporation lawfully forfeit his unpaid shares? What are the ' +
      'procedural requirements?',
    flashcard_ids: ['comm-12'], // Subscription / unpaid subscription
  },

  // =========================================================================
  // LABOR LAW — 2 questions
  // =========================================================================
  {
    subject_id: 'labor-law',
    question_text:
      'Gloria was employed as a sales manager for five years. After a ' +
      'mid-year performance review, the company issued her a show-cause ' +
      'notice for alleged gross neglect of duty due to consistently missed ' +
      'sales quotas. She submitted an explanation, but the company dismissed ' +
      'her two days later without a formal hearing. Gloria files a complaint ' +
      'for illegal dismissal. (a) Discuss the twin-notice and hearing ' +
      'requirements for a valid termination. (b) Was the dismissal valid? ' +
      'What are the consequences of a procedurally defective termination ' +
      'where a just cause actually exists?',
    flashcard_ids: ['labor-1'], // Arts. 292/299 Illegal Dismissal
  },
  {
    subject_id: 'labor-law',
    question_text:
      'Manny was hired as a construction worker for a specific building ' +
      'project with a 12-month contract. After the building was completed, ' +
      'the company hired him again for a new project, then again for a third. ' +
      'By his fourth year, Manny filed a complaint claiming regular employment ' +
      'status and security of tenure. (a) Distinguish project employees from ' +
      'regular employees under the Labor Code. (b) Is Manny\'s claim tenable ' +
      'after four years of repeated engagement? Discuss the doctrine of ' +
      'repeated hiring.',
    flashcard_ids: ['labor-10'], // Arts. 280/286 Regular vs. Project Employment
  },

  // =========================================================================
  // TAXATION — 2 questions
  // =========================================================================
  {
    subject_id: 'taxation',
    question_text:
      'Ms. Santos is a self-employed certified public accountant. For taxable ' +
      'year 2024, she reported gross receipts of ₱3,500,000 but deducted ' +
      '₱2,800,000 in business expenses, resulting in a declared taxable ' +
      'income of ₱700,000. After audit, the BIR disallowed ₱1,200,000 in ' +
      'deductions for lack of official receipts and imposed a 50% surcharge ' +
      'and 12% annual interest. (a) What are the requisites for a deduction ' +
      'to be allowed under the NIRC? (b) Is the 50% surcharge proper? ' +
      'Distinguish the instances when 50% vs. 100% surcharge applies.',
    flashcard_ids: ['tax-1', 'tax-8'], // Income tax + Surcharge
  },
  {
    subject_id: 'taxation',
    question_text:
      'A BIR examiner assessed VAT deficiency of ₱500,000 against TJ Trading, ' +
      'a domestic corporation that sells goods subject to 12% VAT. TJ Trading ' +
      'contests the assessment, arguing that its transactions are VAT-exempt ' +
      'under a special law and submits a Bureau of Internal Revenue ruling in ' +
      'its favor obtained two years earlier. The BIR revoked the ruling ' +
      'prospectively. (a) Discuss the VAT treatment and the general rule on ' +
      'exemptions. (b) Can the BIR revoke a previously issued ruling and ' +
      'apply it retroactively? Explain the limits.',
    flashcard_ids: ['tax-2'], // VAT / Secs. 105-115 NIRC
  },

  // =========================================================================
  // REMEDIAL LAW — 2 questions
  // =========================================================================
  {
    subject_id: 'remedial-law',
    question_text:
      'Plaintiff Ana filed a collection suit against Defendant Ben for ' +
      '₱900,000 in the Regional Trial Court of Manila. Ben was personally ' +
      'served summons but failed to file any answer within the reglementary ' +
      'period. Ana moved to declare Ben in default. The court granted the ' +
      'motion and allowed Ana to present evidence ex parte. Ben subsequently ' +
      'filed a motion to lift the order of default. (a) Discuss the ' +
      'jurisdictional and procedural requirements for a valid default order. ' +
      '(b) What must Ben show to have the default lifted? Explain.',
    flashcard_ids: ['rem-1', 'rem-2'], // Jurisdiction + Default
  },
  {
    subject_id: 'remedial-law',
    question_text:
      'The Regional Trial Court dismissed a criminal case for lack of probable ' +
      'cause, over the objection of the prosecution. The prosecution filed a ' +
      'special civil action for certiorari under Rule 65 before the Court of ' +
      'Appeals to challenge the dismissal. The accused moved to dismiss the ' +
      'petition, citing double jeopardy. (a) When is certiorari the proper ' +
      'remedy against a trial court\'s interlocutory or final order? ' +
      '(b) Does the filing of a certiorari petition by the prosecution violate ' +
      'double jeopardy? Explain the rule and its exceptions.',
    flashcard_ids: ['rem-12'], // Rule 65 Certiorari
  },

  // =========================================================================
  // LEGAL ETHICS — 2 questions
  // =========================================================================
  {
    subject_id: 'legal-ethics',
    question_text:
      'Atty. Reyes was retained as counsel by Corporation A in a breach of ' +
      'contract dispute against Corporation B. While the case was pending, ' +
      'Corporation B approached Atty. Reyes and offered a much higher retainer ' +
      'if he would switch sides and represent Corporation B instead. Atty. ' +
      'Reyes withdrew from representing Corporation A and entered his ' +
      'appearance for Corporation B. (a) Identify the ethical violation(s) ' +
      'committed. (b) What duties under the Code of Professional Responsibility ' +
      'and Accountability (CPRA) govern conflicts of interest and client ' +
      'loyalty? What are the consequences for Atty. Reyes?',
    flashcard_ids: ['ethics-1'], // Canon IV Conflict of Interest
  },
  {
    subject_id: 'legal-ethics',
    question_text:
      'Atty. Domingo entered into a contingency fee agreement with his client ' +
      'Celia for a land recovery case: he would receive 40% of whatever was ' +
      'recovered. The agreement was oral. After winning the case, Atty. Domingo ' +
      'sought to enforce the agreement and claim his 40% share of the ' +
      '₱4,000,000 judgment. Celia refused to pay more than ₱100,000. ' +
      '(a) What are the requisites for a valid contingency fee agreement under ' +
      'the CPRA? (b) Is the oral agreement enforceable? Discuss quantum meruit ' +
      'as an alternative basis for recovery.',
    flashcard_ids: ['ethics-10'], // Canon II Attorney\'s Fees
  },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function seed() {
  let created = 0;
  let skipped = 0;

  for (const q of QUESTIONS) {
    try {
      const id = 'alac-seed-' + randomUUID().substring(0, 8);
      await db.createAlacQuestion({
        id,
        subject_id: q.subject_id,
        question_text: q.question_text,
        linked_flashcard_ids: q.flashcard_ids,
      });
      console.log(`  ✅ [${q.subject_id}] ${q.question_text.substring(0, 70)}...`);
      created++;
    } catch (err) {
      console.error(`  ❌ Failed [${q.subject_id}]: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. Created ${created} questions, ${skipped} failed.`);
}

seed().catch(err => console.error('Seed error:', err.message));
