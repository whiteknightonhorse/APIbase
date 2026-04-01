/** Imgflip API raw response types (UC-286). */

export interface ImgflipMeme {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  box_count: number;
}

export interface ImgflipMemesOutput {
  memes: {
    id: string;
    name: string;
    url: string;
    boxes: number;
  }[];
  count: number;
}

export interface ImgflipCaptionOutput {
  url: string;
  page_url: string;
}
