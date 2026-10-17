// Official free pages per author: site names, page titles and URLs ONLY.
// Nothing from these pages is fetched or copied. A user saves a link-out (title + URL + the
// reference as written on the page) from here; the user can also add their own pages in Library.
//
// pageStatesReference: whether the site's pages usually print the Bible reference they are about
// (true), usually do not (false), or it differs from page to page ("varies").

export type PageStatesReference = true | false | "varies";

export interface AuthorPage {
  title: string;
  url: string;
}

export interface AuthorSite {
  id: string;
  author: string;
  site: string;
  pageStatesReference: PageStatesReference;
  pages: AuthorPage[];
}

export const AUTHOR_SITES: AuthorSite[] = [
  {
    id: "bgea",
    author: "Billy Graham",
    site: "Billy Graham Evangelistic Association",
    pageStatesReference: "varies",
    pages: [
      { title: "Daily devotions", url: "https://billygraham.org/devotions/" },
      { title: "Answers", url: "https://billygraham.org/answer/" },
    ],
  },
  {
    id: "philip-anthony-mitchell",
    author: "Philip Anthony Mitchell",
    site: "Philip Anthony Mitchell",
    pageStatesReference: "varies",
    pages: [
      { title: "Official site", url: "https://www.philipanthonymitchell.com/" },
      { title: "YouTube channel", url: "https://www.youtube.com/@philipanthonymitchell" },
      { title: "2819 Church on YouTube", url: "https://www.youtube.com/user/victorychurchatl" },
    ],
  },
  {
    id: "ligonier",
    author: "R. C. Sproul",
    site: "Ligonier Ministries",
    pageStatesReference: "varies",
    pages: [
      { title: "R. C. Sproul teacher page", url: "https://learn.ligonier.org/teachers/rc-sproul" },
      { title: "Articles", url: "https://learn.ligonier.org/articles" },
      { title: "Teaching series", url: "https://learn.ligonier.org/series" },
      { title: "Renewing Your Mind podcast", url: "https://learn.ligonier.org/podcasts/renewing-your-mind" },
      { title: "Renewing Your Mind", url: "https://renewingyourmind.org" },
    ],
  },
  {
    id: "desiring-god",
    author: "John Piper",
    site: "Desiring God",
    pageStatesReference: true,
    pages: [
      { title: "Articles", url: "https://www.desiringgod.org/articles" },
      { title: "Messages", url: "https://www.desiringgod.org/messages" },
    ],
  },
  {
    id: "truth-for-life",
    author: "Alistair Begg",
    site: "Truth For Life",
    pageStatesReference: true,
    pages: [
      { title: "Sermon series", url: "https://www.truthforlife.org/resources/series/" },
      { title: "Most recent sermons", url: "https://www.truthforlife.org/resources/most-recent-sermons/" },
    ],
  },
];
