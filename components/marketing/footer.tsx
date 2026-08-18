import Link from "next/link";
import { GraduationCap, Twitter, Instagram, Youtube, Linkedin } from "lucide-react";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it Works", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
      { label: "AI Tutor Demo", href: "#demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help Center", href: "#" },
      { label: "Study Guides", href: "#" },
      { label: "Curriculum Coverage", href: "#" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "Data Security", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
                <GraduationCap className="h-4 w-4" />
              </div>
              <span className="text-base font-bold text-gray-900 dark:text-gray-50">mAITeacher</span>
            </div>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Your personal AI teacher - adaptive lessons, a Socratic tutor, and real progress tracking.
            </p>
            <div className="mt-4 flex gap-3">
              <a href="#" aria-label="Twitter" className="text-gray-400 hover:text-primary-600">
                <Twitter className="h-4 w-4" />
              </a>
              <a href="#" aria-label="Instagram" className="text-gray-400 hover:text-primary-600">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="#" aria-label="YouTube" className="text-gray-400 hover:text-primary-600">
                <Youtube className="h-4 w-4" />
              </a>
              <a href="#" aria-label="LinkedIn" className="text-gray-400 hover:text-primary-600">
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-50">{col.title}</h4>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-gray-500 hover:text-primary-600 dark:text-gray-400">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-gray-100 pt-6 text-center text-sm text-gray-400 dark:border-gray-800">
          © {new Date().getFullYear()} mAITeacher. All rights reserved. Built for students, by a student.
        </div>
      </div>
    </footer>
  );
}
