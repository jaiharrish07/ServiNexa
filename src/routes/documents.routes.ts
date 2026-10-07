import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { wrap } from '../utils/api-response';
import multer from 'multer';

const router = Router();

const BUCKET = 'documents';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/csv',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} not allowed`));
  },
});

async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_FILE_SIZE });
  }
}

router.post(
  '/documents/upload',
  authenticate,
  upload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const { service_request_id, work_order_id } = req.body ?? {};
    if (!service_request_id) return res.status(400).json({ error: 'service_request_id is required' });

    await ensureBucket();

    const ext = file.originalname.split('.').pop() ?? 'bin';
    const path = `${service_request_id}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadErr) return res.status(500).json({ error: `Upload failed: ${uploadErr.message}` });

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const fileUrl = urlData.publicUrl;

    const { data: doc, error: dbErr } = await supabase
      .from('documents')
      .insert({
        service_request_id,
        work_order_id: work_order_id || null,
        name: file.originalname,
        file_url: fileUrl,
        file_type: file.mimetype,
        file_size: file.size,
        uploaded_by: req.user!.id,
      })
      .select()
      .single();

    if (dbErr) return res.status(500).json({ error: dbErr.message });

    return res.status(201).json(wrap('document', doc));
  }),
);

router.get(
  '/documents/:service_request_id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { service_request_id } = req.params;
    const { data, error } = await supabase
      .from('documents')
      .select('*, uploader:users!uploaded_by(full_name)')
      .eq('service_request_id', service_request_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(wrap('documents', data ?? []));
  }),
);

router.delete(
  '/documents/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { data: doc } = await supabase.from('documents').select('*').eq('id', id).single();
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (doc.file_url) {
      const urlParts = doc.file_url.split(`/${BUCKET}/`);
      if (urlParts[1]) {
        await supabase.storage.from(BUCKET).remove([urlParts[1]]);
      }
    }

    await supabase.from('documents').delete().eq('id', id);
    return res.json({ deleted: true });
  }),
);

export default router;
