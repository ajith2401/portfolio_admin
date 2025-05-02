// src/models/writings.model.js
import mongoose from 'mongoose';

const WritingSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: [
      'philosophy', 'poem', 'article', 'short story',
      'short writings', 'politics', 'cinema', 'letter', 'joke'
    ],
    index: true // Index category for faster queries
  },
  title: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  subtitle: {
    type: String,
    trim: true,
    index: true // Add index for subtitle to help with Tamil search
  },
  body: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
    index: true // Add index for status
  },
  images: {
    small: String,
    medium: String,
    large: String
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
    index: true
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  ratings: [{
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    index: true // Add index for the updated date
  },
  // Add this field to optimize searching for Tamil content
  contentLanguage: {
    type: String,
    enum: ['en', 'ta', 'mixed'], // English, Tamil, or mixed content
    default: 'en',
    index: true
  }
});

// Create a more robust text index with language configuration
WritingSchema.index({ 
  title: 'text', 
  subtitle: 'text',
  body: 'text',
  category: 'text'
}, {
  weights: {
    title: 10, // Title is most important
    subtitle: 8,
    body: 5,
    category: 3
  },
  language_override: 'language', // Will look for a 'language' field
  default_language: 'none' // Important for Tamil search - disables language-specific stemming
});

// Auto-detect language based on content
WritingSchema.pre('save', function(next) {
  // Update timestamps
  this.updatedAt = new Date();
  
  // Auto-detect Tamil content
  const tamilRegex = /[\u0B80-\u0BFF]/;
  const englishRegex = /[a-zA-Z]/;
  
  const hasTamil = tamilRegex.test(this.title) || tamilRegex.test(this.body);
  const hasEnglish = englishRegex.test(this.title) || englishRegex.test(this.body);
  
  if (hasTamil && hasEnglish) {
    this.contentLanguage = 'mixed';
  } else if (hasTamil) {
    this.contentLanguage = 'ta';
  } else {
    this.contentLanguage = 'en';
  }
  
  next();
});

WritingSchema.methods.calculateAverageRating = function() {
  if (this.ratings.length === 0) {
    this.averageRating = 0;
    this.totalRatings = 0;
    return;
  }
  
  const sum = this.ratings.reduce((acc, rating) => acc + rating.rating, 0);
  this.averageRating = (sum / this.ratings.length).toFixed(1);
  this.totalRatings = this.ratings.length;
};

WritingSchema.pre('save', function(next) {
  this.calculateAverageRating();
  next();
});

WritingSchema.methods.addRating = async function(name, email, rating) {
  const existingRating = this.ratings.find(r => r.email === email);
  
  if (existingRating) {
    existingRating.rating = rating;
    existingRating.name = name;
  } else {
    this.ratings.push({ name, email, rating });
  }
  
  this.calculateAverageRating();
  await this.save();
};

// Add a static method for Tamil-specific searching
WritingSchema.statics.searchTamil = async function(query, options = {}) {
  const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
  
  // Create a query for Tamil content
  const searchQuery = {
    $or: [
      { contentLanguage: 'ta' }, 
      { contentLanguage: 'mixed' }
    ]
  };
  
  // Add the search pattern if provided
  if (query && query.trim() !== '') {
    // Normalize the query
    const normalizedQuery = query.trim().normalize('NFC');
    
    // Create a pattern that's more flexible for Tamil
    const titlePattern = new RegExp(normalizedQuery, 'i');
    const bodyPattern = new RegExp(normalizedQuery, 'i');
    
    searchQuery.$and = [
      searchQuery.$or,
      {
        $or: [
          { title: titlePattern },
          { body: bodyPattern },
          { subtitle: titlePattern }
        ]
      }
    ];
  }
  
  // Execute the query with pagination
  const skip = (page - 1) * limit;
  const writings = await this.find(searchQuery)
    .sort(sort)
    .skip(skip)
    .limit(limit);
    
  const total = await this.countDocuments(searchQuery);
  
  return {
    writings,
    pagination: {
      total,
      pages: Math.ceil(total / limit),
      current: page
    }
  };
};

// Use a try-catch to handle model registration
let Writing;
try {
  Writing = mongoose.model('Writing');
} catch {
  Writing = mongoose.model('Writing', WritingSchema);
}

export { Writing };