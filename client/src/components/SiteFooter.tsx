import { Link } from 'react-router';

/** Links every page needs, such as the Content policy (NFR-L1). */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="annotation">ProjectBridge · CSE 3102, CSEDU</span>
      <nav aria-label="Site">
        <Link to="/policy">Content policy</Link>
      </nav>
    </footer>
  );
}
