export default function Footer() {
  return (
    <footer className="text-sm text-neutral-500 pt-8 border-t border-neutral-900 space-y-4">
      <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        <a className="hover:text-neutral-300" href="/privacy">
          Privacy
        </a>
        <a className="hover:text-neutral-300" href="/terms">
          Terms
        </a>
        <a
          className="hover:text-neutral-300"
          href="https://github.com/shivam-app-developers/ai-optimizer/blob/main/SECURITY.md"
        >
          Security
        </a>
        <a className="hover:text-neutral-300" href="mailto:hello@ai-optimizer.dev">
          Support
        </a>
        <a
          className="hover:text-neutral-300"
          href="https://status.ai-optimizer.dev"
          target="_blank"
          rel="noreferrer"
        >
          Status
        </a>
        <a
          className="hover:text-neutral-300"
          href="https://github.com/shivam-app-developers/ai-optimizer"
        >
          GitHub
        </a>
      </nav>
      <p className="text-center">
        ai-optimizer is built by Shivam App Studio. MIT engine + commercial Pro packs.
      </p>
    </footer>
  );
}
