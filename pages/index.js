import { useState } from 'react'
import Head from 'next/head'
import ConfettiExplosion from 'react-confetti-explosion'
import styles from '../styles/Home.module.css'

// Exponential backoff utility function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))


const fetchWithRetry = async (url, options = {}, maxRetries = 3, baseDelay = 1000) => {
  let lastError
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      
      // If response is successful, return it
      if (response.ok) {
        return response
      }
      
      // If it's a client error (4xx), don't retry
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status} ${response.statusText}`)
      }
      
      // For server errors (5xx) or network issues, throw error to trigger retry
      throw new Error(`Server error: ${response.status} ${response.statusText}`)
      
    } catch (error) {
      lastError = error
      
      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        throw error
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000
      console.log(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms...`)
      
      await sleep(delay)
    }
  }
  
  throw lastError
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [allReviews, setAllReviews] = useState([])
  const [extractedReviews, setExtractedReviews] = useState([])
  const [paginationInfo, setPaginationInfo] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [isExploding, setIsExploding] = useState(false)

  const fetchReviews = async (pid, offset = 0, limit = 100, onRetry = null) => {
    const baseUrl = 'https://api.bazaarvoice.com/data/reviews.json'
    const params = new URLSearchParams({
      'Filter': 'contentlocale:en*',
      'Filter': `ProductId:${pid}`,
      'Sort': 'SubmissionTime:desc',
      'Limit': limit.toString(),
      'Offset': offset.toString(),
      'Include': 'Products,Comments',
      'Stats': 'Reviews',
      'passkey': 'calXm2DyQVjcCy9agq85vmTJv5ELuuBCF2sdg4BnJzJus',
      'apiversion': '5.4',
      'Locale': 'en_US'
    })

    // Create a custom retry function that provides user feedback
    const fetchWithUserFeedback = async (url, options = {}, maxRetries = 3, baseDelay = 1000) => {
      let lastError
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(url, options)
          
          if (response.ok) {
            return response
          }
          
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`Client error: ${response.status} ${response.statusText}`)
          }
          
          throw new Error(`Server error: ${response.status} ${response.statusText}`)
          
        } catch (error) {
          lastError = error
          
          if (attempt === maxRetries) {
            throw error
          }
          
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000
          
          // Provide user feedback about retry attempts
          if (onRetry) {
            onRetry(attempt + 1, maxRetries + 1, Math.round(delay))
          }
          
          await sleep(delay)
        }
      }
      
      throw lastError
    }

    const response = await fetchWithUserFeedback(`${baseUrl}?${params}`, {
      method: 'GET',
      mode: 'cors',
    }, 3, 1000)

    return await response.json()
  }

  const extractPidFromUrl = (url) => {
    try {
      // Split by question mark and take the first part
      const beforeQuestionMark = url.split('?')[0]
      
      // Split by dash and take the last part
      const parts = beforeQuestionMark.split('-')
      const lastPart = parts[parts.length - 1]
      
      return lastPart || null
    } catch (error) {
      return null
    }
  }

  const extractReviewData = (reviews) => {
    return reviews.map(review => ({
      recommended: review.IsRecommended ? 'Yes' : 'No',
      rating: review.Rating || 'N/A',
      title: review.Title || 'No Title',
      reviewtext: review.ReviewText || 'No Review Text'
    }))
  }

  const exportToCSV = () => {
    if (extractedReviews.length === 0) return

    const headers = ['Recommended', 'Rating', 'Title', 'Review Text']
    const csvContent = [
      headers.join(','),
      ...extractedReviews.map(review => [
        `"${review.recommended}"`,
        `"${review.rating}"`,
        `"${review.title.replace(/"/g, '""')}"`,
        `"${review.reviewtext.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `reviews_${extractedReviews[0] ? 'product' : 'data'}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!url.trim()) {
      setMessage('💕 Oops! Please enter a product URL to continue, pretty please! 💕')
      setIsError(true)
      return
    }
    
    const productId = extractPidFromUrl(url.trim())
    if (!productId) {
      setMessage('🤔 Hmm, I couldn\'t find the Product ID in that URL. Could you double-check it for me? 💖')
      setIsError(true)
      return
    }

    setLoading(true)
    setMessage('')
    setIsError(false)
    setAllReviews([])
    setExtractedReviews([])
    setPaginationInfo(null)
    setCurrentPage(0)

    try {
      let allReviewsData = []
      let offset = 0
      let limit = 100
      let totalResults = 0
      let currentPageNum = 0

      while (true) {
        setMessage('')
        
        const data = await fetchReviews(productId, offset, limit, (attempt, maxAttempts, delay) => {
          setMessage('')
        })
        
        if (!data.Results || data.Results.length === 0) {
          break
        }

        allReviewsData = [...allReviewsData, ...data.Results]
        totalResults = data.TotalResults || totalResults
        currentPageNum++
        setCurrentPage(currentPageNum)

        // Update all reviews state in real-time
        setAllReviews(allReviewsData)

        // Update extracted reviews in real-time
        const currentExtractedData = extractReviewData(allReviewsData)
        setExtractedReviews(currentExtractedData)

        // Update pagination info
        setPaginationInfo({
          totalResults,
          currentOffset: offset,
          currentLimit: limit,
          pagesFetched: currentPageNum
        })

        // If we've fetched all results, break
        if (allReviewsData.length >= totalResults) {
          break
        }

        offset += limit

        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      setAllReviews(allReviewsData)
      const extractedData = extractReviewData(allReviewsData)
      setExtractedReviews(extractedData)
      setMessage('')
      setIsError(false)
      
      // Trigger confetti celebration!
      setIsExploding(true)
      // Reset confetti after animation completes
      setTimeout(() => setIsExploding(false), 3000)

    } catch (error) {
      setMessage(`Oops! Request failed: ${error.message}. But don't worry, we can try again!`)
      setIsError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>✨ JellySCRAPE Magic! ✨</title>
        <meta name="description" content="The cutest way to scrape reviews from Sephora! 💖" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.formContainer}>
          <h1 className={styles.title}>Welcome to JellySCRAPE!@11!!</h1>
          <p className={styles.subtitle}>Paste ANYYY Sephora product URL to extract reviews!!!🙀🙀🙀</p>
          
          <form onSubmit={handleSubmit} className={styles.form}>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.sephora.com/product/..."
              className={styles.input}
              disabled={loading}
            />
            <div style={{ position: 'relative' }}>
              {isExploding && (
                <ConfettiExplosion
                  force={1}
                  duration={3000}
                  particleCount={500}
                  width={2000}
                  colors={['#FFC700', '#FF0000', '#2E3191', '#41BBC7', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#ffb6c1', '#ff69b4']}
                  zIndex={9999}
                />
              )}
              <button 
                type="submit" 
                className={styles.button}
                disabled={loading}
              >
                {loading ? 'Scraping...' : '✨ Scrape Reviews ✨'}
              </button>
            </div>
          </form>

          {message && (
            <div className={`${styles.message} ${isError ? styles.error : ''}`}>
              {message}
            </div>
          )}

          {paginationInfo && (
            <div className={styles.paginationInfo}>
              <p><strong>Total Reviews:</strong> {paginationInfo.totalResults}</p>
              <p><strong>Pages Fetched:</strong> {paginationInfo.pagesFetched}</p>
              <p><strong>Reviews Collected:</strong> {allReviews.length}</p>
              {loading && (
                <div className={styles.progressBar}>
                  <div 
                    className={styles.progressFill}
                    style={{ width: `${(allReviews.length / paginationInfo.totalResults) * 100}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}

          {extractedReviews.length > 0 && (
            <div className={styles.reviewsContainer}>
              <div className={styles.reviewsHeader}>
                <h3>Reviews ({extractedReviews.length})</h3>
                {!loading && (
                  <button 
                    onClick={exportToCSV}
                    className={styles.exportButton}
                  >
                    Export to CSV
                  </button>
                )}
              </div>
              
              <div className={styles.tableContainer}>
                <table className={styles.reviewsTable}>
                  <thead>
                    <tr>
                      <th>Recommended</th>
                      <th>Rating</th>
                      <th>Title</th>
                      <th>Review Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedReviews.map((review, index) => (
                      <tr key={index}>
                        <td className={styles.recommendedCell}>
                          <span className={`${styles.recommendedBadge} ${review.recommended === 'Yes' ? styles.recommendedYes : styles.recommendedNo}`}>
                            {review.recommended}
                          </span>
                        </td>
                        <td className={styles.ratingCell}>
                          <span className={styles.rating}>{review.rating}</span>
                        </td>
                        <td className={styles.titleCell}>{review.title}</td>
                        <td className={styles.textCell}>
                          {review.reviewtext.length > 100 
                            ? review.reviewtext.substring(0, 100) + '...'
                            : review.reviewtext
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
