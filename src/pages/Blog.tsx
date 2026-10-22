import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";

const Blog = () => {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SEO
        title="Blog | SeatPing"
        description="The SeatPing blog is under construction. Ideas for smarter queues, smoother service, and better guest relationships are on the way."
        canonical="/blog"
      />
      <Header />
      <main className="flex flex-1 items-end justify-center px-6 pt-28 sm:pt-32">
        <div className="w-full max-w-xl text-center">
          <svg
            data-construction="true"
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 320 200"
            fill="none"
            className="mx-auto mb-8 w-64 max-w-full text-slate-900 sm:w-72"
          >
            <path d="M24 180H296" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
            <path
              d="M76 180V30H100V180M76 150L100 126L76 102L100 78L76 54M76 30L100 54"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M44 58V44H258V58H44ZM100 30L258 44M88 30L44 44"
              fill="#f1f5f9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M64 180H112" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <g data-construction-load="true">
              <path d="M218 58V100M198 116L218 100L238 116" stroke="currentColor" strokeWidth="2" />
              <rect
                x="198"
                y="116"
                width="40"
                height="22"
                rx="3"
                fill="#e2e8f0"
                stroke="currentColor"
                strokeWidth="2"
              />
            </g>
            <rect
              x="166"
              y="158"
              width="40"
              height="22"
              rx="3"
              fill="#f1f5f9"
              stroke="#94a3b8"
              strokeWidth="2"
            />
            <rect
              x="210"
              y="158"
              width="40"
              height="22"
              rx="3"
              fill="#f1f5f9"
              stroke="#94a3b8"
              strokeWidth="2"
            />
          </svg>
          <p className="mb-3 text-label font-medium text-slate-500">SeatPing Blog</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Under Construction
          </h1>
          <p className="mx-auto mt-4 max-w-md text-body leading-relaxed text-slate-600 sm:text-base">
            Ideas for smarter queues, smoother service, and better guest relationships are coming
            soon.
          </p>
          <Button asChild variant="outline" className="mt-7">
            <Link to="/">
              <HugeiconsIcon icon={ArrowLeft02Icon} className="h-4 w-4" aria-hidden="true" />
              Back to Home
            </Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Blog;
