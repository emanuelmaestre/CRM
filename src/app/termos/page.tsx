import pagesConfig from "@/config/pages.json";

const copy = pagesConfig.terms;

export const metadata = {
  title: copy.metadataTitle,
};

export default function TermosPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 font-sans text-[15px] leading-relaxed text-gray-800">
      <h1 className="text-2xl font-bold mb-2">{copy.title}</h1>
      <p className="text-sm text-gray-500 mb-8">{copy.lastUpdated}</p>

      {copy.sections.map((section) => (
        <section key={section.title} className="mb-8">
          <h2 className="text-base font-semibold mb-2">{section.title}</h2>
          <p>{section.content}</p>
        </section>
      ))}
    </main>
  );
}
