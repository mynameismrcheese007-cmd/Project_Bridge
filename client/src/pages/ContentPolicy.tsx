import { Link } from 'react-router';
import { REPORT_CATEGORY_LABELS } from '../api';

const CATEGORY_TEXT: Record<keyof typeof REPORT_CATEGORY_LABELS, string> = {
  SPAM: 'Advertising, repeated posts or links unrelated to the project.',
  HARASSMENT: 'Insults, threats or targeting a person or group.',
  INAPPROPRIATE: 'Sexual, violent or otherwise offensive material.',
  COPYRIGHT: 'Work copied from someone else without their permission.',
  PRIVACY: "Someone's personal details, such as a phone number or address, posted without their consent.",
  MISLEADING: 'False claims about a project, its results or its team.',
  OTHER: 'Anything else that breaks this policy.',
};

/** NFR-L1: what may be posted, how ownership works, and what happens after a report. */
export function ContentPolicy() {
  return (
    <main className="page page-narrow stack policy">
      <header className="page-header">
        <p className="annotation">Content policy</p>
        <h1>What you can post on ProjectBridge</h1>
        <p className="muted">Everyone agrees to this policy when they create an account. It applies to projects, comments, paid offers, messages and profiles.</p>
      </header>

      <section className="card card-pad stack" aria-labelledby="policy-allowed">
        <h2 id="policy-allowed">1. What belongs here</h2>
        <p>University projects, and the comments, contact requests and offers that help them grow. Keep it honest, relevant and respectful.</p>
        <ul>
          <li>Describe your project truthfully, including what works and what does not yet.</li>
          <li>Comment on the work, not on the person.</li>
          <li>Paid offers must describe real work and pay. ProjectBridge processes no payments.</li>
        </ul>
      </section>

      <section className="card card-pad stack" aria-labelledby="policy-ownership">
        <h2 id="policy-ownership">2. Ownership and copyright</h2>
        <p>Only post work your team made, or work you have permission to share. When you submit a project, you confirm that your team owns it or has the right to publish it.</p>
        <ul>
          <li>Credit libraries, datasets, images and code you did not write, and follow their licences.</li>
          <li>Do not upload someone else's screenshots, designs, reports or source code as your own.</li>
          <li>Your project stays yours. Publishing it here gives ProjectBridge permission to show it to other users, nothing more.</li>
        </ul>
        <p>
          If you believe something here copies your work, report it with the <strong>Copyright infringement</strong> category. You will be asked to confirm that you own the work or act for its owner, and you can add a link to the original.
        </p>
      </section>

      <section className="card card-pad stack" aria-labelledby="policy-not-allowed">
        <h2 id="policy-not-allowed">3. What can be reported</h2>
        <dl className="policy-categories">
          {(Object.keys(REPORT_CATEGORY_LABELS) as Array<keyof typeof REPORT_CATEGORY_LABELS>).map((key) => (
            <div key={key}>
              <dt>{REPORT_CATEGORY_LABELS[key]}</dt>
              <dd>{CATEGORY_TEXT[key]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card card-pad stack" aria-labelledby="policy-reports">
        <h2 id="policy-reports">4. What happens after a report</h2>
        <ol>
          <li>Use <strong>Report</strong> on the project, comment, offer, account or conversation, choose a category and say what is wrong.</li>
          <li>The report changes nothing by itself. An Admin reviews it, and your reason is stored encrypted.</li>
          <li>The Admin either dismisses it or confirms it. You get a notification either way.</li>
          <li>A confirmed report about a project allows the Admin to remove that project. The owner is told why, and only a new review can bring it back.</li>
        </ol>
      </section>

      <section className="card card-pad stack" aria-labelledby="policy-consequences">
        <h2 id="policy-consequences">5. Consequences</h2>
        <p>Depending on how serious and repeated a problem is, an Admin may:</p>
        <ul>
          <li>remove a project or ask its owner for changes;</li>
          <li><strong>restrict</strong> an account, so it can sign in, read and report, but not post;</li>
          <li><strong>suspend</strong> or <strong>ban</strong> an account, which signs it out everywhere.</li>
        </ul>
        <p>Every Admin decision is recorded in an audit log with its reason. If you think a decision was wrong, contact the ProjectBridge administrators.</p>
      </section>

      <p className="muted">
        Questions? <Link to="/register">Create an account</Link> to take part, or go back to <Link to="/">Explore</Link>.
      </p>
    </main>
  );
}
