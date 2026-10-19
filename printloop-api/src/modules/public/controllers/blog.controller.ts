import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { BlogPost, BlogPostStatus } from '@/database/entities/blogPost.entity';
import { blogListQuerySchema } from '@/modules/public/validation/blog.validation';

function serialize(post: BlogPost) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    coverImageUrl: post.coverImageUrl,
    authorName: post.authorName,
    tags: post.tags ?? [],
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
  };
}

export class PublicBlogController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = blogListQuerySchema.parse(req.query);
      const repo = AppDataSource.getRepository(BlogPost);
      const [posts, total] = await repo.findAndCount({
        where: { status: BlogPostStatus.PUBLISHED },
        order: { publishedAt: 'DESC' },
        take: q.limit,
        skip: q.offset,
      });
      res.json({
        success: true,
        data: { posts: posts.map(serialize), total, limit: q.limit, offset: q.offset },
      });
    } catch (err) {
      next(err);
    }
  };

  getBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const repo = AppDataSource.getRepository(BlogPost);
      const post = await repo.findOne({
        where: { slug: String(req.params.slug), status: BlogPostStatus.PUBLISHED },
      });
      if (!post) {
        res.status(404).json({ success: false, message: 'Post not found' });
        return;
      }
      res.json({ success: true, data: serialize(post) });
    } catch (err) {
      next(err);
    }
  };
}

export const publicBlogController = new PublicBlogController();
