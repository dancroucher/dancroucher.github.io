<?php
// Directory to scan
$directory = './video';

// Get all files (excluding . and ..)
$files = array_diff(scandir($directory), ['.', '..']);

// Filter out directories if you only want files
$files = array_filter($files, function($file) use ($directory) {
    return is_file($directory . '/' . $file);
});

// Write to text file
$fileList = implode("\n", $files);
file_put_contents('filenames.txt', $fileList);

echo "File list generated successfully!";
?>