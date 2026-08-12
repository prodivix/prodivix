package agentcontract

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"

	"golang.org/x/image/webp"
)

type EvaluationReviewRasterInspection struct {
	Width              int64
	Height             int64
	ByteLength         int64
	BytesDigest        string
	DecodedPixelDigest string
}

// InspectEvaluationReviewRaster performs the server-side canonical raster
// admission used by both the candidate and its independent scan receipt.
func InspectEvaluationReviewRaster(encoded, mediaType string) (EvaluationReviewRasterInspection, error) {
	decoded, width, height, pixelDigest, err := decodeCanonicalEvaluationRaster(
		encoded, mediaType, maximumAgentEvaluationReviewRasterBytes,
		maximumAgentEvaluationReviewRasterDimension, maximumAgentEvaluationReviewRasterPixels,
	)
	if err != nil {
		return EvaluationReviewRasterInspection{}, err
	}
	return EvaluationReviewRasterInspection{
		Width: width, Height: height, ByteLength: int64(len(decoded)),
		BytesDigest: fmt.Sprintf("sha256-%x", sha256.Sum256(decoded)), DecodedPixelDigest: pixelDigest,
	}, nil
}

func decodeCanonicalEvaluationRaster(
	encoded, mediaType string,
	maximumBytes int,
	maximumDimension int64,
	maximumPixels int64,
) ([]byte, int64, int64, string, error) {
	if encoded == "" || base64.StdEncoding.DecodedLen(len(encoded)) > maximumBytes {
		return nil, 0, 0, "", errors.New("evaluation review raster is empty or oversized")
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(decoded) < 1 || len(decoded) > maximumBytes || base64.StdEncoding.EncodeToString(decoded) != encoded {
		return nil, 0, 0, "", errors.New("evaluation review raster is not canonical bounded base64")
	}
	var width, height int64
	switch mediaType {
	case "image/png":
		width, height, err = validateEvaluationPNG(decoded)
	case "image/webp":
		width, height, err = validateEvaluationWebP(decoded)
	default:
		err = errors.New("evaluation review raster media type is unsupported")
	}
	if err != nil || width < 1 || height < 1 || width > maximumDimension || height > maximumDimension ||
		width > maximumPixels/height {
		return nil, 0, 0, "", errors.New("evaluation review raster dimensions or structure are invalid")
	}
	decodedImage, err := decodeEvaluationRasterImage(decoded, mediaType)
	if err != nil {
		return nil, 0, 0, "", errors.New("evaluation review raster failed full decode")
	}
	actualWidth, actualHeight := int64(decodedImage.Bounds().Dx()), int64(decodedImage.Bounds().Dy())
	if actualWidth != width || actualHeight != height {
		return nil, 0, 0, "", errors.New("evaluation review decoded dimensions drifted from its container")
	}
	pixelDigest, err := digestEvaluationRasterRGBA8(decodedImage)
	if err != nil {
		return nil, 0, 0, "", err
	}
	return decoded, width, height, pixelDigest, nil
}

func decodeEvaluationRasterImage(source []byte, mediaType string) (image.Image, error) {
	switch mediaType {
	case "image/png":
		return png.Decode(bytes.NewReader(source))
	case "image/webp":
		return webp.Decode(bytes.NewReader(source))
	default:
		return nil, errors.New("evaluation review raster media type is unsupported")
	}
}

func digestEvaluationRasterRGBA8(source image.Image) (string, error) {
	bounds := source.Bounds()
	if bounds.Empty() {
		return "", errors.New("evaluation review decoded raster is empty")
	}
	hasher := sha256.New()
	row := make([]byte, bounds.Dx()*4)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			pixel := color.NRGBAModel.Convert(source.At(x, y)).(color.NRGBA)
			offset := (x - bounds.Min.X) * 4
			row[offset], row[offset+1], row[offset+2], row[offset+3] = pixel.R, pixel.G, pixel.B, pixel.A
		}
		if _, err := hasher.Write(row); err != nil {
			return "", err
		}
	}
	return fmt.Sprintf("sha256-%x", hasher.Sum(nil)), nil
}

func validateEvaluationPNG(source []byte) (int64, int64, error) {
	if len(source) < 8 || !bytes.Equal(source[:8], []byte{137, 80, 78, 71, 13, 10, 26, 10}) {
		return 0, 0, errors.New("invalid PNG signature")
	}
	offset, sawHeader, sawPalette, sawTransparency, sawData, sawEnd := 8, false, false, false, false, false
	var width, height int64
	for offset < len(source) {
		if len(source)-offset < 12 {
			return 0, 0, errors.New("truncated PNG chunk")
		}
		length := int(binary.BigEndian.Uint32(source[offset : offset+4]))
		if length < 0 || length > len(source)-offset-12 {
			return 0, 0, errors.New("invalid PNG chunk length")
		}
		chunkType := string(source[offset+4 : offset+8])
		chunkData := source[offset+8 : offset+8+length]
		expectedCRC := binary.BigEndian.Uint32(source[offset+8+length : offset+12+length])
		if crc32.ChecksumIEEE(source[offset+4:offset+8+length]) != expectedCRC {
			return 0, 0, errors.New("invalid PNG chunk checksum")
		}
		switch chunkType {
		case "IHDR":
			if sawHeader || offset != 8 || length != 13 {
				return 0, 0, errors.New("invalid PNG header")
			}
			width = int64(binary.BigEndian.Uint32(chunkData[0:4]))
			height = int64(binary.BigEndian.Uint32(chunkData[4:8]))
			sawHeader = true
		case "PLTE":
			if !sawHeader || sawPalette || sawData || length < 3 || length > 768 || length%3 != 0 {
				return 0, 0, errors.New("invalid PNG palette ordering")
			}
			sawPalette = true
		case "tRNS":
			if !sawHeader || sawTransparency || sawData {
				return 0, 0, errors.New("invalid PNG transparency ordering")
			}
			sawTransparency = true
		case "IDAT":
			if !sawHeader || sawEnd {
				return 0, 0, errors.New("invalid PNG image data ordering")
			}
			sawData = true
		case "IEND":
			if !sawData || sawEnd || length != 0 || offset+12 != len(source) {
				return 0, 0, errors.New("invalid PNG end")
			}
			sawEnd = true
		default:
			// Public review projections exclude textual/profile/extension chunks,
			// which can otherwise carry submissions, refs, or canary material.
			return 0, 0, errors.New("PNG projection contains a non-raster chunk")
		}
		offset += 12 + length
	}
	if !sawHeader || !sawData || !sawEnd {
		return 0, 0, errors.New("incomplete PNG projection")
	}
	config, err := png.DecodeConfig(bytes.NewReader(source))
	if err != nil || int64(config.Width) != width || int64(config.Height) != height {
		return 0, 0, errors.New("PNG dimensions drifted")
	}
	return width, height, nil
}

func validateEvaluationWebP(source []byte) (int64, int64, error) {
	if len(source) < 20 || string(source[:4]) != "RIFF" || string(source[8:12]) != "WEBP" ||
		int(binary.LittleEndian.Uint32(source[4:8])) != len(source)-8 {
		return 0, 0, errors.New("invalid WebP container")
	}
	offset := 12
	var canvasWidth, canvasHeight, frameWidth, frameHeight int64
	sawExtended, sawAlpha, sawImage, frameHasAlpha, frameLossless := false, false, false, false, false
	for offset < len(source) {
		if len(source)-offset < 8 {
			return 0, 0, errors.New("truncated WebP chunk")
		}
		chunkType := string(source[offset : offset+4])
		length := int(binary.LittleEndian.Uint32(source[offset+4 : offset+8]))
		if length < 0 || length > len(source)-offset-8 {
			return 0, 0, errors.New("invalid WebP chunk length")
		}
		data := source[offset+8 : offset+8+length]
		switch chunkType {
		case "VP8 ":
			if sawImage || len(data) < 10 || !bytes.Equal(data[3:6], []byte{0x9d, 0x01, 0x2a}) {
				return 0, 0, errors.New("invalid WebP VP8 frame")
			}
			frameWidth = int64(binary.LittleEndian.Uint16(data[6:8]) & 0x3fff)
			frameHeight = int64(binary.LittleEndian.Uint16(data[8:10]) & 0x3fff)
			sawImage = true
		case "VP8L":
			if sawImage || len(data) < 5 || data[0] != 0x2f {
				return 0, 0, errors.New("invalid WebP VP8L frame")
			}
			frameWidth = int64(1 + uint32(data[1]) + (uint32(data[2]&0x3f) << 8))
			frameHeight = int64(1 + uint32(data[2]>>6) + (uint32(data[3]) << 2) + (uint32(data[4]&0x0f) << 10))
			frameHasAlpha = data[4]&0x10 != 0
			frameLossless = true
			sawImage = true
		case "VP8X":
			if offset != 12 || sawExtended || len(data) != 10 || data[0]&^byte(0x10) != 0 ||
				data[1] != 0 || data[2] != 0 || data[3] != 0 {
				return 0, 0, errors.New("invalid WebP extended header")
			}
			canvasWidth = int64(1 + littleEndianUint24(data[4:7]))
			canvasHeight = int64(1 + littleEndianUint24(data[7:10]))
			sawExtended = true
		case "ALPH":
			if !sawExtended || len(data) < 1 || sawAlpha || sawImage || data[0]&0xc0 != 0 || data[0]&0x03 > 1 {
				return 0, 0, errors.New("invalid WebP alpha ordering")
			}
			sawAlpha = true
		default:
			// Animated, ICC, EXIF, and XMP chunks are outside the projection
			// contract and could smuggle non-perceptual review material.
			return 0, 0, errors.New("WebP projection contains a non-raster chunk")
		}
		offset += 8 + length
		if length%2 != 0 {
			if offset >= len(source) || source[offset] != 0 {
				return 0, 0, errors.New("invalid WebP chunk padding")
			}
			offset++
		}
	}
	if !sawImage || offset != len(source) || (sawAlpha && frameLossless) ||
		(sawExtended && (source[20]&0x10 != 0) != (sawAlpha || frameHasAlpha)) {
		return 0, 0, errors.New("incomplete WebP projection")
	}
	if sawExtended {
		if canvasWidth != frameWidth || canvasHeight != frameHeight {
			return 0, 0, errors.New("WebP frame dimensions drifted from its canvas")
		}
		return canvasWidth, canvasHeight, nil
	}
	return frameWidth, frameHeight, nil
}

func littleEndianUint24(value []byte) uint32 {
	return uint32(value[0]) | uint32(value[1])<<8 | uint32(value[2])<<16
}
