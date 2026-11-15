import { DataSource } from "typeorm";
import { BlogPost, BlogPostStatus } from "@/database/entities/blogPost.entity";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

const POSTS = [
  {
    slug: 'how-printloop-works',
    title: 'How PrintLoop works — from phone to paper in five minutes',
    excerpt:
      'Upload from your phone, pay once with Paystack, walk into any PrintLoop station and enter your code. Here is the whole loop, end to end.',
    content:
      '## The loop in five steps\n\n**1. Upload.** Send your PDF, Word document, PowerPoint or image from your phone — no app install, no USB stick.\n\n**2. Price it.** You see the exact cost before you pay: per page, per copy, per colour. The shop\u2019s pricing matrix is public, not a surprise at the counter.\n\n**3. Pay once.** Secure checkout via Paystack — card, transfer or USSD.\n\n**4. Get your code.** A 6-digit release code arrives instantly by SMS and email.\n\n**5. Collect.** Walk into any PrintLoop station, enter the code, and your prints are ready.\n\n## Why a code?\n\nThe code is your print token. The kiosk can\u2019t print your document until you release it, so your file stays private and nothing prints until you\u2019re there to pick it up.',
    authorName: 'PrintLoop Team',
    tags: ['guide', 'how-it-works'],
    status: BlogPostStatus.PUBLISHED,
    publishedAt: daysAgo(6),
  },
  {
    slug: 'print-from-word-or-powerpoint',
    title: 'Printing Word, PowerPoint and Excel files — what happens to your pages',
    excerpt:
      'Office documents are converted to PDF before printing. Here is what that means for your page count and your price.',
    content:
      '## Your file, converted\n\nWhen you upload a .docx, .pptx or .xlsx, we convert it to a clean PDF before it ever reaches a printer. That conversion is what makes the printed output look exactly like your screen.\n\n## Page count is confirmed after conversion\n\nWord documents don\u2019t always have a fixed page count until they\u2019re laid out. That\u2019s why Office uploads show an **estimated** price, and the final price is confirmed after conversion. If the real page count is higher, the difference is charged to your saved card at the kiosk. If it\u2019s lower, you keep the difference — no refunds needed, no waiting.\n\n## Images too\n\nJPGs and PNGs are wrapped onto A4 pages, centred and scaled to fit.',
    authorName: 'PrintLoop Team',
    tags: ['office', 'guide'],
    status: BlogPostStatus.PUBLISHED,
    publishedAt: daysAgo(2),
  },
  {
    slug: 'group-printing-for-course-reps',
    title: 'Group printing: one link, one code, every classmate\u2019s assignment',
    excerpt:
      'Course representatives can collect and print an entire class\u2019s submissions with one shareable link and one release code.',
    content:
      '## One link, whole class\n\nCreate a group session, share the link in your WhatsApp group, and every classmate uploads their own document, chooses their own settings, and pays for their own pages.\n\n## One code at the kiosk\n\nWhen the deadline passes, you get a single release code. Enter it at the kiosk and the whole batch prints in upload order — collated, ready to hand back.\n\n## Perfect for\n\n- Course assignments and project submissions\n- Club forms and registration packs\n- NYSC and departmental paperwork',
    authorName: 'PrintLoop Team',
    tags: ['groups', 'students'],
    status: BlogPostStatus.PUBLISHED,
    publishedAt: daysAgo(1),
  },
];

export class BlogSeeder {
  public async run(dataSource: DataSource): Promise<BlogPost[]> {
    const repo = dataSource.getRepository(BlogPost);
    return repo.save(POSTS.map((p) => repo.create({ tenantId: null, ...p })));
  }
}
