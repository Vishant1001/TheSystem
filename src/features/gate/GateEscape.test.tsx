import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { systemCopy } from '../../copy/system';
import { GateFailure, GateLayout } from './GateEscape';

/**
 * Step 2.4 review: the Report and Penalty gates block navigation, so a
 * failure on them must offer Retry (in System voice) and Sign out - and
 * nothing else. These render the very components both gate screens use.
 */
const noop = () => undefined;
const retry = systemCopy.actions.retry;
const signOut = systemCopy.auth.signOut;

describe('Penalty gate: an RPC failure', () => {
  it('shows the error in System voice, Retry and Sign out, below the penalty', () => {
    const html = renderToStaticMarkup(
      <GateLayout failure={{ message: 'NO_PENDING_CHOICE' }} onRetry={noop} onSignOut={noop}>
        <p>PENALTY CONTENT</p>
      </GateLayout>,
    );
    expect(html).toContain(systemCopy.errorsByToken.NO_PENDING_CHOICE);
    expect(html).toContain(retry);
    expect(html).toContain(signOut);
    // The penalty stays mounted, so Retry re-runs the failed action; the
    // failure sits right after it, above Sign out.
    expect(html.indexOf('PENALTY CONTENT')).toBeLessThan(html.indexOf(retry));
    expect(html.indexOf(retry)).toBeLessThan(html.indexOf(signOut));
  });

  it('never shows the raw exception text', () => {
    const html = renderToStaticMarkup(
      <GateLayout
        failure={new Error('relation "penalties" does not exist')}
        onRetry={noop}
        onSignOut={noop}
      >
        <p>PENALTY CONTENT</p>
      </GateLayout>,
    );
    expect(html).not.toContain('relation');
    expect(html).toContain(systemCopy.errors.generic);
    expect(html).toContain(retry);
  });

  it('offers Sign out but no Retry when nothing failed', () => {
    const html = renderToStaticMarkup(
      <GateLayout failure={null} onRetry={noop} onSignOut={noop}>
        <p>PENALTY CONTENT</p>
      </GateLayout>,
    );
    expect(html).toContain(signOut);
    expect(html).not.toContain(retry);
  });
});

describe('Gate: a load failure', () => {
  it('shows Retry and Sign out and no other way out', () => {
    const html = renderToStaticMarkup(
      <GateFailure error={new Error('Failed to fetch')} onRetry={noop} onSignOut={noop} />,
    );
    expect(html).toContain(systemCopy.errors.offline);
    expect(html).toContain(retry);
    expect(html).toContain(signOut);
    expect(html).not.toContain('href=');
    expect(html.match(/<button/g)).toHaveLength(2);
  });
});
