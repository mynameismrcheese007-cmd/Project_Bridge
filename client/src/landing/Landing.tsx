import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, STAGE_LABELS, STAGES, type ProjectCard } from '../api';
import { Icon } from '../components/Icon';
import { gsap, ScrollTrigger, SplitText, useGSAP } from '../lib/gsap';
import { AnimatedNumber, MEDIA, type MotionConditions } from '../motion';
import './landing.css';

/**
 * The landing sections Guests see above the project feed.
 *
 * The page is built the way the reference sites move: scrolling is the timeline.
 *  1. The hero is held in place and closes into a framed card as the page moves on.
 *  2. Headings arrive letter by letter.
 *  3. "How it works" keeps an example project in view while the steps beside it light up one at
 *     a time, and the ground shifts from paper to blue to ink.
 *  4. A statement lights up word by word.
 *
 * Nothing is pinned by script: the held sections use CSS `position: sticky`, and GSAP only reads the
 * scroll position. On phones and with reduced motion every section is simply laid out in full.
 */

const STEPS = [
  {
    label: 'Publish',
    title: 'Write it up and submit',
    text: 'A team describes the problem and the solution, adds screenshots and a demo link, and submits. Drafts stay private until then.',
    rows: ['Draft saved', 'Submitted for review'],
  },
  {
    label: 'Review',
    title: 'Checked before it goes public',
    text: 'Every submission gets an automatic security audit and an Admin review. Only approved projects are published.',
    rows: ['Security audit: well', 'Approved and published'],
  },
  {
    label: 'Discover',
    title: 'Found by the people in the field',
    text: 'Professionals search by name and filter by tags. They read the full overview, like the work and leave feedback.',
    rows: ['Listed on Explore', 'Feedback from professionals'],
  },
  {
    label: 'Connect',
    title: 'A private line to the team',
    text: 'A professional sends a contact request. When the team accepts, a private conversation opens. Email addresses are never shown.',
    rows: ['Contact request accepted', 'Private conversation open'],
  },
];

const STATEMENT =
  'Good student work should not end at the last slide of the semester. ProjectBridge keeps it alive: published, reviewed, and in front of the people who can mentor it, fund it, or hire the team behind it.';

interface Stats {
  projects: number;
  items: Array<{ tag: string; count: number }>;
}

export default function Landing({ latest }: { latest?: ProjectCard }) {
  const root = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [entered, setEntered] = useState(false);
  // The card shows the newest project as first loaded; filtering the feed below does not change it.
  const newest = useRef(latest);
  if (!newest.current && latest) newest.current = latest;

  useEffect(() => {
    let alive = true;
    api<Stats>('/projects/tags')
      .then((s) => alive && setStats(s))
      .catch(() => undefined);
    // Two frames, so the starting position is painted before the entrance begins.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => alive && setEntered(true)));
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, []);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      gsap.matchMedia().add(MEDIA, (ctx) => {
        const { reduce, wide, fine } = ctx.conditions as MotionConditions;
        if (reduce) return;

        // Headings arrive letter by letter, in no fixed order.
        gsap.utils.toArray<HTMLElement>('[data-chars]', el).forEach((heading) => {
          SplitText.create(heading, {
            type: 'words,chars',
            aria: 'auto',
            autoSplit: true,
            onSplit: (self) =>
              gsap.from(self.chars, {
                autoAlpha: 0,
                duration: 0.55,
                ease: 'power1.out',
                stagger: { each: 0.016, from: 'random' },
                scrollTrigger: { trigger: heading, start: 'top 86%', once: true },
              }),
          });
        });

        // Blocks rise into place as they come into view.
        gsap.set('.lp-rise', { autoAlpha: 0, y: 28 });
        ScrollTrigger.batch(gsap.utils.toArray<HTMLElement>('.lp-rise', el), {
          start: 'top 90%',
          once: true,
          onEnter: (els) => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'circ.out', stagger: 0.08, clearProps: 'transform,opacity,visibility' }),
        });

        // The statement lights up word by word with the scroll.
        const statement = el.querySelector<HTMLElement>('.lp-statement-text');
        if (statement) {
          SplitText.create(statement, {
            type: 'words',
            aria: 'auto',
            autoSplit: true,
            onSplit: (self) =>
              gsap.fromTo(
                self.words,
                { opacity: 0.16 },
                { opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: statement, start: 'top 78%', end: 'bottom 48%', scrub: 0.5 } },
              ),
          });
        }

        if (!wide) return;
        el.classList.add('lp-live');

        // 1. The hero closes into a framed card while it is held.
        const nav = document.querySelector<HTMLElement>('.navbar')?.offsetHeight ?? 0;
        el.style.setProperty('--lp-nav', `${nav}px`);
        gsap
          .timeline({ defaults: { ease: 'none', duration: 1 }, scrollTrigger: { trigger: '.lp-hero-stage', start: `top ${nav}px`, end: 'bottom bottom', scrub: 0.6 } })
          .to('.lp-hero-frame', { clipPath: 'inset(8% 15% 12% 15%)' }, 0)
          .to('.lp-art-zoom', { scale: 1.16 }, 0)
          .to('.lp-hero-body', { autoAlpha: 0, y: -70, duration: 0.5 }, 0)
          .to('.lp-hero-caption', { autoAlpha: 1, duration: 0.3 }, 0.6);

        // 2. The steps light up one at a time; the example project and the ground follow.
        const how = el.querySelector<HTMLElement>('.lp-how');
        const steps = gsap.utils.toArray<HTMLElement>('.lp-step', el);
        const rows = gsap.utils.toArray<HTMLElement>('.lp-mock-row', el);
        const stages = gsap.utils.toArray<HTMLElement>('.lp-mock-stage', el);
        const setStep = (index: number) => {
          if (!how) return;
          how.dataset.step = String(index);
          steps.forEach((s, i) => s.classList.toggle('is-active', i === index));
          rows.forEach((r) => r.classList.toggle('is-on', Number(r.dataset.from) <= index));
          stages.forEach((s, i) => s.classList.toggle('is-on', i <= index));
          const count = how.querySelector('.lp-count b');
          if (count) count.textContent = String(index + 1).padStart(2, '0');
          how.style.setProperty('--p', String((index + 1) / steps.length));
        };
        setStep(0);
        steps.forEach((step, i) => {
          ScrollTrigger.create({ trigger: step, start: 'top 60%', end: 'bottom 60%', onToggle: (self) => self.isActive && setStep(i) });
        });

        // The artwork leans a little toward the pointer.
        let leave = () => {};
        if (fine) {
          const art = el.querySelector<HTMLElement>('.lp-art-shift');
          const hero = el.querySelector<HTMLElement>('.lp-hero');
          if (art && hero) {
            const x = gsap.quickTo(art, 'x', { duration: 1.1, ease: 'power3.out' });
            const y = gsap.quickTo(art, 'y', { duration: 1.1, ease: 'power3.out' });
            const move = (e: PointerEvent) => {
              const b = hero.getBoundingClientRect();
              x(((e.clientX - b.left) / b.width - 0.5) * -26);
              y(((e.clientY - b.top) / b.height - 0.5) * -18);
            };
            hero.addEventListener('pointermove', move);
            leave = () => hero.removeEventListener('pointermove', move);
          }
        }

        return () => {
          leave();
          el.classList.remove('lp-live');
          if (how) {
            delete how.dataset.step;
            how.style.removeProperty('--p');
          }
          [...steps, ...rows, ...stages].forEach((n) => n.classList.remove('is-active', 'is-on'));
        };
      });
    },
    { scope: root },
  );

  function toFeed() {
    document.getElementById('feed')?.scrollIntoView({ behavior: window.matchMedia(MEDIA.reduce).matches ? 'auto' : 'smooth' });
  }

  const tags = stats?.items ?? [];

  return (
    <div ref={root} className="lp">
      {/* ---------------------------------------------------------------- Hero */}
      <div className="lp-hero-stage">
        <section className={`lp-hero${entered ? ' is-in' : ''}`} aria-labelledby="landing-title">
          <div className="lp-hero-frame">
            <div className="lp-art" aria-hidden="true">
              <div className="lp-art-shift">
                <div className="lp-art-zoom">
                  <img
                    className="lp-art-image"
                    src="/landing/hero-machine.webp"
                    srcSet="/landing/hero-machine-mobile.webp 800w, /landing/hero-machine.webp 1448w"
                    sizes="100vw"
                    alt=""
                    width={1448}
                    height={1086}
                    fetchPriority="high"
                  />
                </div>
              </div>
              <div className="lp-tracks">
                <span className="lp-track lp-track-a">
                  <i>Prototype</i>
                </span>
                <span className="lp-track lp-track-b">
                  <i>Milestone 3 / 5</i>
                </span>
                <span className="lp-track lp-track-c">
                  <i>Team / 04</i>
                </span>
              </div>
            </div>

            <div className="lp-hero-body">
              <p className="lp-eyebrow lp-hero-eyebrow">Students to industry</p>
              <h1 id="landing-title" className="lp-title">
                <span className="lp-line">
                  <span>Student projects,</span>
                </span>
                <span className="lp-line">
                  <span>built to be</span>
                </span>
                <span className="lp-line">
                  <span>
                    <em>discovered.</em>
                  </span>
                </span>
              </h1>

              <div className="lp-hero-foot">
                <div className="lp-hero-copy">
                  <p className="lp-lead">Students publish what they are building. Professionals find it, give feedback and offer real work. ProjectBridge is where the two sides meet.</p>
                  <div className="lp-actions">
                    <Link to="/register" className="lp-cta">
                      <span>Create a free account</span>
                      <b aria-hidden="true">
                        <Icon name="arrow-right" />
                      </b>
                    </Link>
                    <button type="button" className="lp-cta lp-cta-quiet" onClick={toFeed}>
                      <span>Browse projects</span>
                    </button>
                  </div>
                </div>

                {newest.current && (
                  <Link to={`/projects/${newest.current.id}`} className="lp-news">
                    <span className="lp-news-head">
                      <span>Latest project</span>
                      <span>{STAGE_LABELS[newest.current.stage] ?? newest.current.stage}</span>
                    </span>
                    <span className="lp-news-title">{newest.current.title}</span>
                    <span className="lp-news-arrow" aria-hidden="true">
                      <Icon name="arrow-right" />
                    </span>
                  </Link>
                )}
              </div>
            </div>
            <p className="lp-hero-caption" aria-hidden="true">
              <span className="lp-dot" /> Built in public, piece by piece
            </p>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------------------- Tag ticker */}
      {tags.length > 3 && (
        <div className="lp-ticker" aria-hidden="true">
          {[0, 1].map((copy) => (
            <div key={copy} className="lp-ticker-track">
              {tags.map((t) => (
                <span key={t.tag} className="lp-ticker-item">
                  <span className="lp-dot" />
                  {t.tag} <b>{t.count}</b>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- How it works */}
      <section className="lp-how" aria-labelledby="how-title">
        <div className="lp-shell lp-how-grid">
          <div className="lp-how-copy">
            <p className="lp-eyebrow">How it works</p>
            <h2 id="how-title" className="lp-h2" data-chars>
              From a semester project to a working connection
            </h2>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.label} className="lp-step">
                  <p className="lp-label">
                    <span>{String(i + 1).padStart(2, '0')}</span> {s.label}
                  </p>
                  <h3>{s.title}</h3>
                  <p className="lp-step-text">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="lp-how-side" aria-hidden="true">
            <div className="lp-how-sticky">
              <p className="lp-count">
                <b>01</b>
                <span className="lp-count-track">
                  <i />
                </span>
                <span>{String(STEPS.length).padStart(2, '0')}</span>
              </p>
              <div className="lp-mock">
                <p className="lp-mock-head">
                  <span>Example project</span>
                  <span className="lp-dot" />
                </p>
                <p className="lp-mock-title">Smart campus bus tracker</p>
                <div className="lp-mock-stages">
                  {STAGES.slice(0, 4).map((stage) => (
                    <span key={stage} className="lp-mock-stage">
                      {STAGE_LABELS[stage]}
                    </span>
                  ))}
                </div>
                <ul className="lp-mock-rows">
                  {STEPS.flatMap((s, i) =>
                    s.rows.map((row) => (
                      <li key={row} className="lp-mock-row" data-from={i}>
                        <Icon name="check" />
                        <span>{row}</span>
                        <small>{String(i + 1).padStart(2, '0')}</small>
                      </li>
                    )),
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Statement */}
      <section className="lp-statement" aria-label="Why ProjectBridge exists">
        <div className="lp-shell">
          <p className="lp-eyebrow">Why it exists</p>
          <p className="lp-statement-text">{STATEMENT}</p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Numbers */}
      <section className="lp-numbers" aria-labelledby="numbers-title">
        <div className="lp-shell">
          <div className="lp-opener">
            <p className="lp-eyebrow">The platform today</p>
            <h2 id="numbers-title" className="lp-h2" data-chars>
              Small, real, and growing
            </h2>
          </div>
          <dl className="lp-stats">
            <div className="lp-stat lp-rise">
              <dt>Published projects</dt>
              <dd>{stats ? <AnimatedNumber value={stats.projects} /> : '—'}</dd>
              <p>Each one reviewed by an Admin first</p>
            </div>
            <div className="lp-stat lp-rise">
              <dt>Topics covered</dt>
              <dd>{stats ? <AnimatedNumber value={tags.length} /> : '—'}</dd>
              <p>From agriculture to machine learning</p>
            </div>
            <div className="lp-stat lp-rise">
              <dt>Free previews</dt>
              <dd>
                <AnimatedNumber value={20} />
              </dd>
              <p>Project cards a guest can browse before signing in</p>
            </div>
            <div className="lp-stat lp-rise">
              <dt>Payments handled</dt>
              <dd>0</dd>
              <p>Offers are agreed between people; no money passes through here</p>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

/** Closes the guest page: a last call to action over the wordmark. */
export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-shell lp-footer-grid">
        <div>
          <p className="lp-footer-lead">Have something you are building?</p>
          <Link to="/register" className="lp-cta">
            <span>Create a free account</span>
            <b aria-hidden="true">
              <Icon name="arrow-right" />
            </b>
          </Link>
        </div>
        <nav aria-label="Footer" className="lp-footer-nav">
          <p className="lp-label">Navigation</p>
          <a href="#feed">Explore projects</a>
          <Link to="/login">Sign in</Link>
          <Link to="/register">Create an account</Link>
        </nav>
        <div className="lp-footer-note">
          <p className="lp-label">Good to know</p>
          <p>ProjectBridge does not process payments and does not guarantee funding or hiring. A semester project for CSE 3102.</p>
        </div>
      </div>
      <p className="lp-wordmark" aria-hidden="true">
        ProjectBridge
      </p>
    </footer>
  );
}
