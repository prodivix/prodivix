package verification

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestArtifactValidatorAcceptsFullyDecodedBoundedRasterImages(t *testing.T) {
	for _, format := range []string{"png", "jpeg"} {
		t.Run(format, func(t *testing.T) {
			body := encodedArtifactImage(t, format, 3, 2)
			mediaType := "image/" + format
			if format == "jpeg" {
				mediaType = "image/jpeg"
			}
			validated, err := validateStagedArtifact(
				t,
				NewArtifactValidator(nil),
				ArtifactScreenshot,
				mediaType,
				body,
			)
			if err != nil {
				t.Fatalf("validate bounded %s raster: %v", format, err)
			}
			if validated.NormalizedDigest != digestBytes(body) {
				t.Fatalf("normalized digest = %q, want raw image digest", validated.NormalizedDigest)
			}
		})
	}
}

func TestArtifactValidatorDoesNotTextScanCompressedRasterBytes(t *testing.T) {
	body := pngWithLiteralRasterPayload(t, []byte("<script>"))
	if !bytes.Contains(body, []byte("<script>")) {
		t.Fatal("PNG fixture must expose the active-text canary inside its compressed stream")
	}
	if !bytes.Contains(body, []byte("IDAT")) {
		t.Fatal("PNG fixture is missing its Secret canary chunk type")
	}
	if _, err := validateStagedArtifact(
		t,
		NewArtifactValidator(NewCandidateValidator([]string{"IDAT"})),
		ArtifactScreenshot,
		"image/png",
		body,
	); err != nil {
		t.Fatalf("valid compressed raster bytes were treated as text: %v", err)
	}
}

func TestArtifactValidatorRejectsCorruptRasterPayloadsAfterStructuralChecks(t *testing.T) {
	validPNG := encodedArtifactImage(t, "png", 3, 2)
	corruptPNG := corruptArtifactPNGIDAT(t, validPNG)
	if !strictPNG(corruptPNG) {
		t.Fatal("corrupt PNG fixture must retain the allowed chunk structure")
	}

	validJPEG := encodedArtifactImage(t, "jpeg", 8, 8)
	corruptJPEG := truncateArtifactJPEGEntropy(t, validJPEG)
	if !strictJPEG(corruptJPEG) {
		t.Fatal("corrupt JPEG fixture must retain the allowed marker structure")
	}

	for name, fixture := range map[string]struct {
		mediaType string
		body      []byte
	}{
		"png-crc-and-idat": {
			mediaType: "image/png",
			body:      corruptPNG,
		},
		"jpeg-entropy": {
			mediaType: "image/jpeg",
			body:      corruptJPEG,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := validateStagedArtifact(
				t,
				NewArtifactValidator(nil),
				ArtifactScreenshot,
				fixture.mediaType,
				fixture.body,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("corrupt raster accepted: %v", err)
			}
		})
	}
}

func TestArtifactValidatorRejectsImageDecodeBombsBeforeRasterDecode(t *testing.T) {
	fixtures := map[string]struct {
		body      []byte
		mediaType string
		strict    func([]byte) bool
		config    func([]byte) error
	}{
		"png": {
			body:      oversizedArtifactPNG(maximumImageDimension+1, 1),
			mediaType: "image/png",
			strict:    strictPNG,
			config: func(body []byte) error {
				_, err := png.DecodeConfig(bytes.NewReader(body))
				return err
			},
		},
		"png-pixel-budget": {
			body:      oversizedArtifactPNG(maximumImageDimension, 5_000),
			mediaType: "image/png",
			strict:    strictPNG,
			config: func(body []byte) error {
				_, err := png.DecodeConfig(bytes.NewReader(body))
				return err
			},
		},
		"jpeg": {
			body: oversizedArtifactJPEG(
				t,
				encodedArtifactImage(t, "jpeg", 8, 8),
				maximumImageDimension+1,
				1,
			),
			mediaType: "image/jpeg",
			strict:    strictJPEG,
			config: func(body []byte) error {
				_, err := jpeg.DecodeConfig(bytes.NewReader(body))
				return err
			},
		},
	}
	for name, fixture := range fixtures {
		t.Run(name, func(t *testing.T) {
			if !fixture.strict(fixture.body) {
				t.Fatalf("oversized %s fixture must retain the allowed structure", name)
			}
			if err := fixture.config(fixture.body); err != nil {
				t.Fatalf("oversized %s config fixture is invalid: %v", name, err)
			}
			_, err := validateStagedArtifact(
				t,
				NewArtifactValidator(nil),
				ArtifactScreenshot,
				fixture.mediaType,
				fixture.body,
			)
			if err == nil || !errors.Is(err, ErrArtifactRejected) {
				t.Fatalf("%s image decode bomb accepted: %v", name, err)
			}
		})
	}
}

func TestArtifactValidatorRejectsImageStructuralBomb(t *testing.T) {
	header := make([]byte, 13)
	binary.BigEndian.PutUint32(header[0:4], 1)
	binary.BigEndian.PutUint32(header[4:8], 1)
	header[8], header[9] = 8, 2
	body := append([]byte(nil), 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n')
	body = appendArtifactPNGChunk(body, "IHDR", header)
	for range maximumImageStructuralEntries {
		body = appendArtifactPNGChunk(body, "IDAT", nil)
	}
	body = appendArtifactPNGChunk(body, "IEND", nil)

	if strictPNG(body) {
		t.Fatal("PNG structural bomb was accepted")
	}
	if _, err := validateStagedArtifact(
		t,
		NewArtifactValidator(nil),
		ArtifactScreenshot,
		"image/png",
		body,
	); err == nil || !errors.Is(err, ErrArtifactRejected) {
		t.Fatalf("PNG structural bomb reached durable acceptance: %v", err)
	}
}

func encodedArtifactImage(t *testing.T, format string, width int, height int) []byte {
	t.Helper()
	raster := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			raster.SetNRGBA(x, y, color.NRGBA{
				R: uint8(30 + x*20),
				G: uint8(40 + y*20),
				B: 120,
				A: 255,
			})
		}
	}
	var output bytes.Buffer
	var err error
	switch format {
	case "png":
		err = png.Encode(&output, raster)
	case "jpeg":
		err = jpeg.Encode(&output, raster, &jpeg.Options{Quality: 90})
	default:
		t.Fatalf("unsupported test image format %q", format)
	}
	if err != nil {
		t.Fatalf("encode %s fixture: %v", format, err)
	}
	return output.Bytes()
}

func corruptArtifactPNGIDAT(t *testing.T, body []byte) []byte {
	t.Helper()
	result := append([]byte(nil), body...)
	for offset := 8; offset+12 <= len(result); {
		length := int(binary.BigEndian.Uint32(result[offset : offset+4]))
		if offset+12+length > len(result) {
			t.Fatal("PNG fixture has an invalid chunk boundary")
		}
		if string(result[offset+4:offset+8]) == "IDAT" && length > 0 {
			result[offset+8] ^= 0x80
			return result
		}
		offset += 12 + length
	}
	t.Fatal("PNG fixture has no non-empty IDAT chunk")
	return nil
}

func truncateArtifactJPEGEntropy(t *testing.T, body []byte) []byte {
	t.Helper()
	for offset := 2; offset+4 <= len(body); {
		if body[offset] != 0xff {
			t.Fatal("JPEG fixture has an invalid marker boundary")
		}
		marker := body[offset+1]
		length := int(binary.BigEndian.Uint16(body[offset+2 : offset+4]))
		if length < 2 || offset+2+length > len(body) {
			t.Fatal("JPEG fixture has an invalid segment length")
		}
		if marker == 0xda {
			scanStart := offset + 2 + length
			if scanStart >= len(body)-2 {
				t.Fatal("JPEG fixture has no entropy payload")
			}
			result := append([]byte(nil), body[:scanStart+1]...)
			return append(result, 0xff, 0xd9)
		}
		offset += 2 + length
	}
	t.Fatal("JPEG fixture has no start-of-scan segment")
	return nil
}

func oversizedArtifactPNG(width uint32, height uint32) []byte {
	header := make([]byte, 13)
	binary.BigEndian.PutUint32(header[0:4], width)
	binary.BigEndian.PutUint32(header[4:8], height)
	header[8], header[9] = 8, 2

	output := append([]byte(nil), 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n')
	output = appendArtifactPNGChunk(output, "IHDR", header)
	output = appendArtifactPNGChunk(output, "IDAT", []byte{})
	output = appendArtifactPNGChunk(output, "IEND", []byte{})
	return output
}

func oversizedArtifactJPEG(
	t *testing.T,
	body []byte,
	width uint16,
	height uint16,
) []byte {
	t.Helper()
	result := append([]byte(nil), body...)
	for offset := 2; offset+4 <= len(result); {
		if result[offset] != 0xff {
			t.Fatal("JPEG fixture has an invalid marker boundary")
		}
		marker := result[offset+1]
		length := int(binary.BigEndian.Uint16(result[offset+2 : offset+4]))
		if length < 2 || offset+2+length > len(result) {
			t.Fatal("JPEG fixture has an invalid segment length")
		}
		if marker == 0xc0 || marker == 0xc2 {
			if length < 8 {
				t.Fatal("JPEG frame header fixture is too short")
			}
			binary.BigEndian.PutUint16(result[offset+5:offset+7], height)
			binary.BigEndian.PutUint16(result[offset+7:offset+9], width)
			return result
		}
		offset += 2 + length
	}
	t.Fatal("JPEG fixture has no frame header")
	return nil
}

func pngWithLiteralRasterPayload(t *testing.T, pixels []byte) []byte {
	t.Helper()
	if len(pixels) == 0 || len(pixels) > maximumImageDimension {
		t.Fatal("literal PNG fixture pixel width is invalid")
	}
	header := make([]byte, 13)
	binary.BigEndian.PutUint32(header[0:4], uint32(len(pixels)))
	binary.BigEndian.PutUint32(header[4:8], 1)
	header[8], header[9] = 8, 0

	var compressed bytes.Buffer
	writer, err := zlib.NewWriterLevel(&compressed, zlib.NoCompression)
	if err != nil {
		t.Fatalf("create uncompressed zlib fixture: %v", err)
	}
	if _, err := writer.Write(append([]byte{0}, pixels...)); err != nil {
		t.Fatalf("write PNG scanline fixture: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close PNG scanline fixture: %v", err)
	}

	output := append([]byte(nil), 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n')
	output = appendArtifactPNGChunk(output, "IHDR", header)
	output = appendArtifactPNGChunk(output, "IDAT", compressed.Bytes())
	return appendArtifactPNGChunk(output, "IEND", nil)
}

func appendArtifactPNGChunk(destination []byte, kind string, payload []byte) []byte {
	length := make([]byte, 4)
	binary.BigEndian.PutUint32(length, uint32(len(payload)))
	destination = append(destination, length...)
	chunkStart := len(destination)
	destination = append(destination, kind...)
	destination = append(destination, payload...)
	checksum := make([]byte, 4)
	binary.BigEndian.PutUint32(
		checksum,
		crc32.ChecksumIEEE(destination[chunkStart:]),
	)
	return append(destination, checksum...)
}
