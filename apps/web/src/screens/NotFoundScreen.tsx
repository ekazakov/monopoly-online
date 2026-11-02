import { Link } from "@tanstack/react-router";

export function NotFoundScreen() {
  return (
    <main className="screen">
      <h1>Not found</h1>
      <p>This page does not exist.</p>
      <Link to="/">Back to home</Link>
    </main>
  );
}
