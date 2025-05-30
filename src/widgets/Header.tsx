import Link from "next/link";

export const Header = () => {
  return (
    <header className="mb-14">
      <Link className="inline-block" href="/">
        <span className="font-bold text-2xl">Byoo.log</span>
      </Link>
    </header>
  );
};
